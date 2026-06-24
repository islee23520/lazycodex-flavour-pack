import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { escapeRegExp } from "../src/utils/toml-string-utils.ts";

const packageJson = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));
const pluginJson = JSON.parse(readFileSync(path.resolve(".codex-plugin", "plugin.json"), "utf8"));
const hooksJson = JSON.parse(readFileSync(path.resolve("hooks", "hooks.json"), "utf8"));
const cliText = readFileSync(path.resolve("src", "cli", "cli.ts"), "utf8");
const readmeText = readFileSync(path.resolve("README.md"), "utf8");
const agentsText = readOptionalText("AGENTS.md");
const roadmapText = readOptionalText("ROADMAP.md");
const publishWorkflowPath = path.resolve(".github", "workflows", "publish.yml");

test("given npm package metadata when validating publish settings then package is public", () => {
  assert.notEqual(packageJson.private, true);
  assert.equal(packageJson.engines.node, ">=20.12.0");
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

test("given npm package metadata when validating package entry then bare import target ships", () => {
  const entryTarget = packageJson.exports?.["."] ?? packageJson.main;

  assert.equal(typeof entryTarget, "string", "bare import target must be declared");
  assert.equal(path.isAbsolute(entryTarget), false, "bare import target must be package-relative");
  const normalizedTarget = entryTarget.replace(/^\.\//, "");
  assert.equal(existsSync(path.resolve(normalizedTarget)), true, "bare import target must exist");
  assert.equal(isPublishedFile(normalizedTarget), true, "bare import target must be included in package files");
});

test("given local npm scripts when validating setup command then they run LazyCodex install first", () => {
  assert.doesNotMatch(packageJson.scripts.setup, /--skip-lazycodex-install/);
  assert.doesNotMatch(packageJson.scripts["dry-setup"], /--skip-lazycodex-install/);
});

test("given npm package metadata when validating release files then package includes runtime surface", () => {
  assert.deepEqual(packageJson.files, [
    ".codex-plugin",
    "agent-configs",
    "agent-overrides",
    "hooks",
    "scripts",
    "dist",
    "README.md"
  ]);
});

test("given plugin metadata references runtime scripts when validating release files then package includes them", () => {
  const _publishedFiles = new Set(packageJson.files);
  for (const filePath of getReferencedRuntimeScripts()) {
    assert.equal(isPublishedFile(filePath), true, `${filePath} must be included in package files`);
  }
});

test("given plugin manifest when validating release metadata then bundled manifest is parseable", () => {
  assert.equal(pluginJson.name, "lfp");
  assert.equal(packageJson.name, "@islee23520/lfp");
  assert.equal(pluginJson.version, packageJson.version);
  assert.equal(pluginJson.hooks, "./hooks/hooks.json");
  assert.equal(Object.hasOwn(pluginJson, "mcpServers"), false);
  assert.deepEqual(pluginJson["x-lfp"].additionalAgents, []);
  assert.deepEqual(pluginJson["x-lfp"].tools ?? [], []);
});

test("given scoped npm package name when validating docs and CLI help then npx commands use package identity", () => {
  const npxCommand = `npx ${packageJson.name}@latest setup`;

  assert.match(cliText, new RegExp(escapeRegExp(npxCommand)));
  assert.match(readmeText, new RegExp(escapeRegExp(npxCommand)));
  assert.doesNotMatch(cliText, /npx lfp@latest/);
  assert.doesNotMatch(readmeText, /npx lfp@latest/);
});

test("given documentation when validating agent model field scope then stale six-field contract is absent", () => {
  for (const [name, text] of [
    ["README.md", readmeText],
    ["AGENTS.md", agentsText],
    ["ROADMAP.md", roadmapText]
  ]) {
    assert.doesNotMatch(text, /six public/i, `${name} must not describe a six-public-field contract`);
    assert.doesNotMatch(text, /six fields/i, `${name} must not describe a six-field contract`);
  }

  if (agentsText !== "") {
    assert.match(agentsText, /three primary model fields/);
  }
});

test("given npm package metadata when validating internal files then code maps are excluded", () => {
  const publishedFiles = new Set(packageJson.files);
  assert.equal(publishedFiles.has("AGENTS.md"), false);
  assert.equal(publishedFiles.has("ROADMAP.md"), false);
  assert.equal(publishedFiles.has("test"), false);
  assert.equal(publishedFiles.has("src"), false);
  assert.equal(existsSync(path.resolve(".npmignore")), true);
});

test("given release automation when validating repository metadata then publish workflow exists", () => {
  assert.equal(existsSync(publishWorkflowPath), true, "publish workflow must exist at .github/workflows/publish.yml");
});

test("given publish workflow when validating release automation then it publishes from release and manual dispatch", () => {
  const workflowText = readFileSync(publishWorkflowPath, "utf8");

  assert.match(workflowText, /^name:\s+Publish Package$/m);
  assert.match(workflowText, /^on:\n(?:.+\n)*\s+release:\n(?:.+\n)*\s+types:\s*\[published\]/m);
  assert.match(workflowText, /^on:\n(?:.+\n)*\s+workflow_dispatch:\s*$/m);
  assert.match(workflowText, /id-token:\s+write/);
  assert.match(workflowText, /node-version:\s+24/);
  assert.doesNotMatch(workflowText, /registry-url/);
  assert.match(workflowText, /npm publish --provenance --access public/);
  assert.doesNotMatch(workflowText, /NODE_AUTH_TOKEN/);
  assert.doesNotMatch(workflowText, /secrets\.NPM_TOKEN/);
});

test("given publish automation docs when validating operator guidance then readme explains npm auth setup", () => {
  assert.match(readmeText, /## Publish/);
  assert.match(readmeText, /trusted publishing/);
  assert.doesNotMatch(readmeText, /NPM_TOKEN/);
  assert.match(readmeText, /islee23520\/lazycodex-flavour-pack/);
  assert.match(readmeText, /release published/);
});

test("given role policy defaults when validating package metadata then packaged config exists", () => {
  const rolePolicyPath = path.resolve("agent-configs", "lfp-role-policies.toml");
  assert.equal(existsSync(rolePolicyPath), true);
  const text = readFileSync(rolePolicyPath, "utf8");
  assert.match(text, /\[policies\.explorer\]/);
  assert.match(text, /reasoning = "low"/);
  assert.match(text, /tier = "fast"/);
  assert.match(text, /\[policies\.plan\]/);
  assert.match(text, /reasoning = "xhigh"/);
});

function getReferencedRuntimeScripts() {
  const scriptPaths = [];
  for (const eventHooks of Object.values(hooksJson.hooks ?? {})) {
    for (const entry of eventHooks) {
      for (const hook of entry.hooks ?? []) {
        const match = /\$\{PLUGIN_ROOT}\/(scripts\/[^"]+\.mjs)/.exec(hook.command ?? "");
        if (match !== null) scriptPaths.push(match[1]);
      }
    }
  }
  return [...new Set(scriptPaths)].sort();
}

function isPublishedFile(filePath) {
  const normalized = filePath.replace(/^\.\//, "");
  return packageJson.files.some((entry) => normalized === entry || normalized.startsWith(`${entry}/`));
}

function readOptionalText(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!existsSync(absolutePath)) return "";
  return readFileSync(absolutePath, "utf8");
}
