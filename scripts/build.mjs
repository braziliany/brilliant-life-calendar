import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sources = ["src/core.js", "src/runtime.js", "src/entry.js"];
const banner = `// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: calendar-alt;
// Pulse Calendar v0.1.0 — generated file. Edit src/* instead.
`;

const chunks = await Promise.all(
  sources.map((path) => readFile(resolve(root, path), "utf8")),
);
const output = [banner.trimEnd(), ...chunks.map((chunk) => chunk.trimEnd())].join("\n\n") + "\n";
await writeFile(resolve(root, "Pulse Calendar.js"), output);
console.log(`Built Pulse Calendar.js from ${sources.length} source files.`);
