import assert from "node:assert/strict";
import test from "node:test";
import "../src/core.js";
import { calendarFixture } from "./fixtures.js";

const files = new Map();
const directories = new Set();
const fm = {
  documentsDirectory: () => "/documents",
  joinPath: (left, right) => `${left}/${right}`,
  fileExists: (path) => directories.has(path) || files.has(path),
  createDirectory: (path) => directories.add(path),
  readString: (path) => files.get(path),
  writeString: (path, value) => files.set(path, value),
};
globalThis.FileManager = { local: () => fm };

const keychain = new Map();
globalThis.Keychain = {
  contains: (key) => keychain.has(key),
  get: (key) => keychain.get(key),
  set: (key, value) => keychain.set(key, value),
};

globalThis.Alert = class AlertMock {
  constructor() { this.values = []; }
  addTextField() { this.values.push("fixture-client-id"); }
  addSecureTextField() { this.values.push("fixture-client-secret"); }
  addAction() {}
  addCancelAction() {}
  textFieldValue(index) { return this.values[index]; }
  async presentAlert() { return 0; }
};

let requestMode = "success";
let observedRequest;
globalThis.Request = class RequestMock {
  constructor(url) {
    this.url = url;
    this.response = { statusCode: 200 };
    observedRequest = this;
  }

  async loadString() {
    if (requestMode === "failure") {
      this.response.statusCode = 503;
      return "unavailable";
    }
    if (requestMode === "forbidden") {
      this.response.statusCode = 403;
      return "forbidden";
    }
    if (requestMode === "malformed") return "{not-json";
    if (requestMode === "offline") throw new Error("network unavailable with transport details");
    return JSON.stringify(calendarFixture());
  }
};

await import("../src/runtime.js");
const runtime = globalThis.__PulseCalendarRuntime;

test("credentials are read from and configured only through Keychain", async () => {
  keychain.clear();
  assert.equal(runtime.readCredentials(), null);
  const configured = await runtime.configureCredentials();
  assert.deepEqual(configured, {
    clientId: "fixture-client-id",
    clientSecret: "fixture-client-secret",
  });
  assert.equal(keychain.get(runtime.CLIENT_ID_KEY), "fixture-client-id");
  assert.equal(keychain.get(runtime.CLIENT_SECRET_KEY), "fixture-client-secret");
});

test("loggable failures are reduced to stable codes", () => {
  assert.equal(runtime.safeErrorCode(new Error("HTTP_503"), "NETWORK_ERROR"), "HTTP_503");
  assert.equal(
    runtime.safeErrorCode(new Error("request failed with private response details"), "NETWORK_ERROR"),
    "NETWORK_ERROR",
  );
});

test("network request uses the exact read-only endpoint and Access headers", async () => {
  const calendar = await runtime.fetchCalendar("2026-09", {
    clientId: "id-example",
    clientSecret: "secret-example",
  });
  assert.equal(observedRequest.url, `${runtime.ENDPOINT}?month=2026-09`);
  assert.equal(observedRequest.method, "GET");
  assert.equal(observedRequest.headers["CF-Access-Client-Id"], "id-example");
  assert.equal(observedRequest.headers["CF-Access-Client-Secret"], "secret-example");
  assert.equal(calendar.month, "2026-09");
});

test("successful fetch caches normalized facts without credentials and failure falls back", async () => {
  files.clear();
  requestMode = "success";
  const now = new Date("2026-09-13T01:04:00.000Z");
  const credentials = { clientId: "id-example", clientSecret: "secret-example" };
  const online = await runtime.loadCalendar("2026-09", credentials, now);
  assert.equal(online.source, "network");

  const serialized = [...files.values()].join("\n");
  assert.doesNotMatch(serialized, /id-example|secret-example/);
  assert.match(serialized, /"cacheSchemaVersion":"1"/);

  requestMode = "failure";
  const offline = await runtime.loadCalendar("2026-09", credentials, now);
  assert.equal(offline.source, "cache");
  assert.equal(offline.calendar.days.length, 30);
});

test("403, offline and malformed JSON paths preserve and reuse the last valid cache", async () => {
  files.clear();
  const now = new Date("2026-09-13T01:04:00.000Z");
  const credentials = { clientId: "id-example", clientSecret: "secret-example" };
  requestMode = "success";
  await runtime.loadCalendar("2026-09", credentials, now);
  const validCache = [...files.values()][0];

  for (const mode of ["forbidden", "offline", "malformed"]) {
    requestMode = mode;
    const result = await runtime.loadCalendar("2026-09", credentials, now);
    assert.equal(result.source, "cache", `${mode} did not fall back to cache`);
    assert.equal([...files.values()][0], validCache, `${mode} overwrote the valid cache`);
  }
});
