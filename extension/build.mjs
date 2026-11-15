// Bundles the extension into dist/ (load that folder unpacked in chrome://extensions).
// Usage: node build.mjs [--watch]
import * as esbuild from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

const staticFiles = [
  ["manifest.json", "manifest.json"],
  ["src/popup/popup.html", "popup.html"],
  ["icons/icon16.png", "icons/icon16.png"],
  ["icons/icon32.png", "icons/icon32.png"],
  ["icons/icon48.png", "icons/icon48.png"],
  ["icons/icon128.png", "icons/icon128.png"],
];

async function copyStatic() {
  await mkdir(join(dist, "icons"), { recursive: true });
  await Promise.all(staticFiles.map(([from, to]) => copyFile(join(root, from), join(dist, to))));
}

const common = {
  bundle: true,
  target: "chrome120",
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  absWorkingDir: root,
};

const builds = [
  { ...common, entryPoints: ["src/sw/index.ts"], outfile: "dist/sw.js", format: "esm" },
  { ...common, entryPoints: ["src/content/index.ts"], outfile: "dist/content.js", format: "iife" },
  { ...common, entryPoints: ["src/popup/index.ts"], outfile: "dist/popup.js", format: "iife" },
];

await rm(dist, { recursive: true, force: true });
await copyStatic();

if (watch) {
  // Static files are copied once on start; re-run the watcher after editing manifest.json or popup.html.
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("[parrot] watching… reload the extension in chrome://extensions after changes");
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  console.log("[parrot] built extension → dist/");
}
