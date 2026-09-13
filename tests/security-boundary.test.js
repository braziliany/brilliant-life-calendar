import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeSource = await readFile(new URL("../src/runtime.js", import.meta.url), "utf8");

test("runtime is a read-only client with no embedded Access credential values", () => {
  assert.match(runtimeSource, /request\.method = "GET"/);
  assert.doesNotMatch(runtimeSource, /request\.method = "(?:POST|PUT|PATCH|DELETE)"/);
  assert.match(runtimeSource, /Keychain\.get/);
  assert.match(runtimeSource, /Keychain\.set/);
  assert.doesNotMatch(runtimeSource, /clientSecret\s*=\s*["'][^"']+["']/);
});

test("runtime targets only the frozen Production Widget API", () => {
  assert.match(runtimeSource, /https:\/\/pulse\.sophier\.org\/api\/v1\/calendar\/widget/);
  assert.doesNotMatch(runtimeSource, /workers\.dev|preview|\/api\/calendar(?:["'?`])/i);
});
