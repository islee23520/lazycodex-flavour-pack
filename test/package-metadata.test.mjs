import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { readOverrideConfig } from "../scripts/model-override-config.mjs";

const packageJson = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));
const pluginJson = JSON.parse(readFileSync(path.resolve(".codex-plugin", "plugin.json"), "utf8"));
const hooksJson = JSON.parse(readFileSync(path.resolve("hooks", "hooks.json"), "utf8"));
const legacyOmoOverridesJson = JSON.parse(readFileSync(path.resolve("agent-overrides", "omo.json"), "utf8"));
const cliText = readFileSync(path.resolve("scripts/cli.mjs"), "utf8");
const readmeText = readFileSync(path.resolve("README.md"), "utf8");
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
    "scripts/agent-model-config-io.mjs",
    "scripts/agent-model-config.mjs",
    "scripts/art-team-config.mjs",
    "scripts/art-team-hook.mjs",
    "scripts/cli-args.mjs",
    "scripts/cli-reporting.mjs",
    "scripts/cli.mjs",
    "scripts/codex-apps-cache.mjs",
    "scripts/codex-plugin-install.mjs",
    "scripts/codex-provider-config.mjs",
    "scripts/global-model-defaults.mjs",
    "scripts/install-transaction.mjs",
    "scripts/lazycodex-install.mjs",
    "scripts/mcp-model-fallback.mjs",
    "scripts/model-benchmark-recommendations.mjs",
    "scripts/model-benchmark-scenarios.mjs",
    "scripts/model-benchmark-overrides.mjs",
    "scripts/model-benchmark-results.mjs",
    "scripts/model-benchmark.mjs",
    "scripts/model-config-prompts.mjs",
    "scripts/model-field-scope.mjs",
    "scripts/model-fallback-guidance.mjs",
    "scripts/model-fallback-resolver.mjs",
    "scripts/model-override-config.mjs",
    "scripts/model-override-schema.mjs",
    "scripts/model-provider.mjs",
    "scripts/model-reasoning-compat.mjs",
    "scripts/model-recommendations.mjs",
    "scripts/provider-consent.mjs",
    "scripts/runtime-promotion.mjs",
    "scripts/setup-command.mjs",
    "scripts/setup-provider-tui.mjs",
    "scripts/setup-provider.mjs",
    "scripts/setup-tui.mjs",
    "scripts/sync-agent-overrides-hook.mjs",
    "scripts/sync-agent-overrides.mjs",
    "scripts/user-prompt-submit.mjs",
    "scripts/user-model-overrides.mjs",
    "scripts/visual-engineering-hook.mjs",
    "README.md"
  ]);
});

test("given plugin metadata references runtime scripts when validating release files then package includes them", () => {
  const publishedFiles = new Set(packageJson.files);
  for (const filePath of getReferencedRuntimeScripts()) {
    assert.equal(publishedFiles.has(filePath), true, `${filePath} must be included in package files`);
  }
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
  assert.equal(publishedFiles.has("scripts/isolated-smoke.mjs"), false);
  assert.equal(existsSync(path.resolve(".npmignore")), true);
});

test("given legacy OMO override consumers when validating release files then JSON stays aligned with durable TOML", () => {
  const durableConfig = readOverrideConfig(path.resolve("agent-configs", "omo-agent-model-overrides.toml"));

  assert.deepEqual(legacyOmoOverridesJson.source, { agentsDir: "${CODEX_HOME}/agents" });
  for (const agentName of Object.keys(legacyOmoOverridesJson.overrides)) {
    assert.deepEqual(legacyOmoOverridesJson.overrides[agentName], durableConfig.overrides[agentName]);
  }
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getReferencedRuntimeScripts() {
  const scriptPaths = [];
  for (const tool of pluginJson["x-lfp"]?.tools ?? []) {
    if (typeof tool.path === "string") scriptPaths.push(tool.path.replace(/^\.\//, ""));
  }
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
