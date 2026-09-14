import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sources = ["src/core.js", "src/runtime.js", "src/entry.js"];
const coreSource = await readFile(resolve(root, sources[0]), "utf8");
const metadataMatch = coreSource.match(/const RELEASE_METADATA_JSON = `([^`]*)`;/);
if (!metadataMatch) throw new Error("Missing RELEASE_METADATA_JSON in src/core.js");
const release = JSON.parse(metadataMatch[1]);
const banner = `// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: calendar-alt;
// Pulse Calendar v${release.version} — generated file. Edit src/* instead.
`;

const chunks = await Promise.all(
  sources.map((path, index) => (
    index === 0 ? coreSource : readFile(resolve(root, path), "utf8")
  )),
);
const output = [banner.trimEnd(), ...chunks.map((chunk) => chunk.trimEnd())].join("\n\n") + "\n";
await writeFile(resolve(root, "Pulse Calendar.js"), output);
console.log(`Built Pulse Calendar.js from ${sources.length} source files.`);
