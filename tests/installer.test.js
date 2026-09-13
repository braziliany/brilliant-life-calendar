import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

globalThis.__BRILLIANT_LIFE_INSTALLER_TEST__ = true;

const productionLikeScript = `${`// Variables used by Scriptable.
globalThis.__PulseCalendarRuntime = {};
const widget = new ListWidget();
Script.setWidget(widget);
`}\n${"// production bundle content\n".repeat(24)}`;

let remoteBody = productionLikeScript;
let remoteStatus = 200;
let requestedUrl = null;
let alertSelections = [];
const files = new Map();

globalThis.Request = class RequestMock {
  constructor(url) {
    this.url = url;
    this.response = { statusCode: remoteStatus };
    requestedUrl = url;
  }
  async loadString() {
    this.response.statusCode = remoteStatus;
    return remoteBody;
  }
};

globalThis.Alert = class AlertMock {
  addAction() {}
  addDestructiveAction() {}
  addCancelAction() {}
  async presentAlert() { return alertSelections.shift() ?? 0; }
};

const fileManager = {
  documentsDirectory: () => "/icloud/Scriptable",
  joinPath: (left, right) => `${left}/${right}`,
  fileExists: (path) => files.has(path),
  writeString: (path, value) => files.set(path, value),
};
globalThis.FileManager = { iCloud: () => fileManager };

await import("../installer.js");
const installer = globalThis.__BrilliantLifeCalendarInstaller;

function reset() {
  remoteBody = productionLikeScript;
  remoteStatus = 200;
  requestedUrl = null;
  alertSelections = [];
  files.clear();
}

test("installer downloads from the production main Raw URL", async () => {
  reset();
  await installer.downloadProductionScript();
  assert.equal(requestedUrl, installer.INSTALL_URL);
  assert.equal(
    requestedUrl,
    "https://raw.githubusercontent.com/braziliany/brilliant-life-calendar/main/Pulse%20Calendar.js",
  );
});

test("valid Scriptable JavaScript installs into iCloud Documents", async () => {
  reset();
  const result = await installer.install();
  assert.equal(result.installed, true);
  assert.equal(files.get("/icloud/Scriptable/Pulse Calendar.js"), `${productionLikeScript.trim()}\n`);
});

test("empty and HTML responses are rejected before writing", async () => {
  for (const body of ["", "<!doctype html><html><body>404</body></html>"]) {
    reset();
    remoteBody = body;
    await assert.rejects(() => installer.install(), /EMPTY_RESPONSE|HTML_RESPONSE/);
    assert.equal(files.size, 0);
  }
});

test("a non-JavaScript response is rejected before writing", async () => {
  reset();
  remoteBody = "Download temporarily unavailable. ".repeat(40);
  await assert.rejects(() => installer.install(), /INVALID_SCRIPT_RESPONSE/);
  assert.equal(files.size, 0);
});

test("a non-200 response is rejected before writing", async () => {
  reset();
  remoteStatus = 404;
  await assert.rejects(() => installer.install(), /DOWNLOAD_HTTP_404/);
  assert.equal(files.size, 0);
});

test("an existing script requires explicit overwrite confirmation", async () => {
  reset();
  const path = "/icloud/Scriptable/Pulse Calendar.js";
  files.set(path, "existing script");
  alertSelections = [0, 0];
  const result = await installer.install();
  assert.equal(result.installed, true);
  assert.notEqual(files.get(path), "existing script");
});

test("declining overwrite keeps the existing script and skips download", async () => {
  reset();
  const path = "/icloud/Scriptable/Pulse Calendar.js";
  files.set(path, "existing script");
  alertSelections = [-1];
  const result = await installer.install();
  assert.deepEqual(result, { installed: false, reason: "OVERWRITE_DECLINED", targetPath: path });
  assert.equal(files.get(path), "existing script");
  assert.equal(requestedUrl, null);
});

test("installer contains no credential header names and never touches Keychain", async () => {
  const source = await readFile(new URL("../installer.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /CF-Access-Client-(?:Id|Secret)|Keychain/);
});
