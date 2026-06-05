import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const packageJson = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));
const pluginJson = JSON.parse(readFileSync(path.resolve(".codex-plugin", "plugin.json"), "utf8"));
const cliText = readFileSync(path.resolve("scripts/cli.mjs"), "utf8");
const readmeText = readFileSync(path.resolve("README.md"), "utf8");

test("given npm package metadata when validating publish settings then package is public", () => {
  assert.notEqual(packageJson.private, true);
  assert.deepEqual(packageJson.publishConfig, {
    access: "public",
    registry: "https://registry.npmjs.org/"
  });
});

test("given npm package metadata when validating bin entries then publish-safe targets exist", () => {
  assert.equal(typeof packageJson.bin, "object");

  for (const [name, target] of Object.entries(packageJson.bin)) {
    assert.match(name, /^[a-z0-9._-]+$/i);
    assert.equal(target.startsWith("./"), false, `bin target for ${name} must not start with ./`);
    assert.equal(path.isAbsolute(target), false, `bin target for ${name} must be package-relative`);
    assert.equal(existsSync(path.resolve(target)), true, `bin target for ${name} must exist`);
  }
});

test("given npm package metadata when validating release files then package includes runtime surface", () => {
  assert.deepEqual(packageJson.files, [
    ".codex-plugin",
    "agent-configs",
    "agent-overrides",
    "hooks",
    "scripts",
    "README.md"
  ]);
});

test("given plugin manifest when validating release metadata then bundled manifest is parseable", () => {
  assert.equal(pluginJson.name, packageJson.name);
  assert.equal(pluginJson.version, packageJson.version);
  assert.equal(pluginJson.hooks, "./hooks/hooks.json");
});

test("given scoped npm package name when validating docs and CLI help then npx commands use package identity", () => {
  const npxCommand = `npx ${packageJson.name}@latest setup`;

  assert.match(cliText, new RegExp(escapeRegExp(npxCommand)));
  assert.match(readmeText, new RegExp(escapeRegExp(npxCommand)));
  assert.doesNotMatch(cliText, /npx lfp@latest/);
  assert.doesNotMatch(readmeText, /npx lfp@latest/);
});

test("given npm package metadata when validating internal files then code maps are excluded", () => {
  const publishedFiles = new Set(packageJson.files);
  assert.equal(publishedFiles.has("AGENTS.md"), false);
  assert.equal(publishedFiles.has("ROADMAP.md"), false);
  assert.equal(publishedFiles.has("test"), false);
  assert.equal(existsSync(path.resolve(".npmignore")), true);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
