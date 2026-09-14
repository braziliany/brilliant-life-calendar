import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "../src/core.js";

globalThis.__BRILLIANT_LIFE_INSTALLER_TEST__ = true;

function productionScript(version = "0.1.1", notes = ["Layout fix"]) {
  const metadata = JSON.stringify({ version, notes });
  return `${`// Variables used by Scriptable.
const RELEASE_METADATA_JSON = \`${metadata}\`;
globalThis.__PulseCalendarRuntime = {};
const widget = new ListWidget();
Script.setWidget(widget);
`}\n${"// production bundle content\n".repeat(24)}`;
}

let remoteBody = productionScript();
let remoteStatus = 200;
let requestedUrl = null;
let alertSelections = [];
let alerts = [];
let keychainCalls = 0;
const files = new Map();

globalThis.Request = class RequestMock {
  constructor(url) { this.url = url; this.response = { statusCode: remoteStatus }; requestedUrl = url; }
  async loadString() { this.response.statusCode = remoteStatus; return remoteBody; }
};

globalThis.Alert = class AlertMock {
  constructor() { this.actions = []; this.destructiveActions = []; alerts.push(this); }
  addAction(value) { this.actions.push(value); }
  addDestructiveAction(value) { this.destructiveActions.push(value); }
  addCancelAction(value) { this.cancelAction = value; }
  async presentAlert() { return alertSelections.shift() ?? 0; }
};

globalThis.Keychain = new Proxy({}, {
  get() { keychainCalls += 1; throw new Error("Installer must not access Keychain"); },
});

const fileManager = {
  documentsDirectory: () => "/icloud/Scriptable",
  joinPath: (left, right) => `${left}/${right}`,
  fileExists: (path) => files.has(path),
  isFileDownloaded: () => true,
  downloadFileFromiCloud: async () => {},
  readString: (path) => files.get(path),
  writeString: (path, value) => files.set(path, value),
};
globalThis.FileManager = { iCloud: () => fileManager };

await import("../installer.js");
const installer = globalThis.__BrilliantLifeCalendarInstaller;
const targetPath = "/icloud/Scriptable/Pulse Calendar.js";

function reset() {
  remoteBody = productionScript();
  remoteStatus = 200;
  requestedUrl = null;
  alertSelections = [];
  alerts = [];
  keychainCalls = 0;
  files.clear();
}

function localScript(version) {
  return productionScript(version, ["Local build"]);
}

async function installWithLocal(localContent, selection = 0) {
  reset();
  if (localContent != null) files.set(targetPath, localContent);
  alertSelections = [selection, 0];
  return installer.install();
}

test("installer downloads from the production main Raw URL", async () => {
  reset();
  const result = await installer.downloadProductionScript();
  assert.equal(requestedUrl, installer.INSTALL_URL);
  assert.equal(requestedUrl, "https://raw.githubusercontent.com/braziliany/brilliant-life-calendar/main/Pulse%20Calendar.js");
  assert.equal(result.release.version, "0.1.1");
});

test("no local script uses the install flow", async () => {
  const result = await installWithLocal(null);
  assert.equal(result.state, "install");
  assert.equal(result.version, "0.1.1");
  assert.match(alerts[0].title, /^安装 Pulse Calendar$/);
  assert.deepEqual(alerts[0].actions, ["安装"]);
  assert.match(alerts[0].message, /远端：0\.1\.1[\s\S]*更新内容：[\s\S]*Layout fix/);
  assert.equal(files.get(targetPath), `${remoteBody.trim()}\n`);
});

test("an older local version uses the update flow", async () => {
  const result = await installWithLocal(localScript("0.1.0"));
  assert.equal(result.state, "update");
  assert.equal(alerts[0].title, "更新 Pulse Calendar");
  assert.deepEqual(alerts[0].actions, ["更新"]);
  assert.match(alerts[0].message, /本地：0\.1\.0\n远端：0\.1\.1/);
});

test("the same local version permits reinstall", async () => {
  const result = await installWithLocal(localScript("0.1.1"));
  assert.equal(result.state, "reinstall");
  assert.equal(alerts[0].title, "重新安装 Pulse Calendar");
  assert.deepEqual(alerts[0].actions, ["重新安装"]);
});

test("a newer local development version is recognized and never called an update", async () => {
  const previous = localScript("0.2.0");
  const result = await installWithLocal(previous, -1);
  assert.equal(result.installed, false);
  assert.equal(result.state, "newer");
  assert.equal(alerts[0].title, "当前本地版本较新");
  assert.deepEqual(alerts[0].destructiveActions, ["降级安装"]);
  assert.match(alerts[0].message, /本地：0\.2\.0\n远端：0\.1\.1/);
  assert.equal(files.get(targetPath), previous);
});

test("missing or malformed local versions use the legacy compatibility flow", async () => {
  for (const source of ["old unversioned script", "const VERSION = 'not-semver';"]) {
    const result = await installWithLocal(source);
    assert.equal(result.state, "legacy");
    assert.equal(alerts[0].title, "更新旧版 Pulse Calendar");
    assert.match(alerts[0].message, /本地：旧版 \/ 版本未知/);
  }
});

test("semver comparison is numeric rather than lexical", () => {
  assert.equal(installer.compareSemver("0.9.0", "0.10.0"), -1);
  assert.equal(installer.compareSemver("1.0.0", "1.0.1"), -1);
  assert.equal(installer.compareSemver("1.0.1", "1.0.0"), 1);
  assert.equal(installer.compareSemver("1.0.0", "1.0.0"), 0);
});

test("empty, HTML, invalid JavaScript, and non-200 responses are rejected", async () => {
  for (const [body, status, error] of [
    ["", 200, /EMPTY_RESPONSE/],
    ["<!doctype html><html><body>404</body></html>", 200, /HTML_RESPONSE/],
    ["Download unavailable. ".repeat(40), 200, /INVALID_SCRIPT_RESPONSE/],
    [productionScript(), 404, /DOWNLOAD_HTTP_404/],
  ]) {
    reset(); remoteBody = body; remoteStatus = status;
    await assert.rejects(() => installer.install(), error);
    assert.equal(files.size, 0);
  }
});

test("declining any version plan never writes the target", async () => {
  const previous = localScript("0.1.0");
  const result = await installWithLocal(previous, -1);
  assert.deepEqual(result, { installed: false, reason: "USER_DECLINED", state: "update", targetPath });
  assert.equal(files.get(targetPath), previous);
});

test("installer preserves credentials and configuration by contract", async () => {
  await installWithLocal(localScript("0.1.0"));
  const source = await readFile(new URL("../installer.js", import.meta.url), "utf8");
  assert.equal(keychainCalls, 0);
  assert.doesNotMatch(source, /CF-Access-Client-(?:Id|Secret)/);
  assert.doesNotMatch(source, /Keychain\s*\.(?:set|remove|reset)/);
  assert.doesNotMatch(source, /FileManager\.local/);
  assert.match(alerts[0].message, /Keychain 凭据与现有配置不会被覆盖/);
});

test("installer, source, and generated bundle share one release metadata source", async () => {
  const source = await readFile(new URL("../src/core.js", import.meta.url), "utf8");
  const bundle = await readFile(new URL("../Pulse Calendar.js", import.meta.url), "utf8");
  const expected = globalThis.__PulseCalendarCore.RELEASE_METADATA;
  assert.deepEqual(installer.extractReleaseMetadata(source), expected);
  assert.deepEqual(installer.extractReleaseMetadata(bundle), expected);
  assert.equal(globalThis.__PulseCalendarCore.VERSION, expected.version);
  assert.equal(globalThis.__PulseCalendarCore.APP_VERSION, expected.version);
  assert.match(bundle, new RegExp(`Pulse Calendar v${expected.version.replaceAll(".", "\\.")}`));
});
