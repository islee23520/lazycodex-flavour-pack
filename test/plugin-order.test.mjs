import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const CLI = path.resolve("scripts/cli.mjs");
const LAZYCODEX_INSTALL_STUB = path.resolve("test/fixtures/lazycodex-install-stub.mjs");

test("given LFP plugin table is before LazyCodex when setup runs then LFP is moved after LazyCodex", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-plugin-order-"));
  try {
    const fixture = createFixture(root);
    writeFileSync(
      path.join(fixture.codexHome, "config.toml"),
      [
        '[plugins."lfp@islee23520"]',
        "enabled = true",
        "",
        '[plugins."omo@sisyphuslabs"]',
        "enabled = true",
        "",
        '[plugins."lazycodex-ai"]',
        "enabled = true",
        ""
      ].join("\n")
    );

    const result = runCli(["setup", "--config", fixture.configPath], fixture.codexHome);
    const codexConfig = readFileSync(path.join(fixture.codexHome, "config.toml"), "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.equal(pluginTableIndex(codexConfig, "lfp@islee23520") > pluginTableIndex(codexConfig, "omo@sisyphuslabs"), true);
    assert.equal(pluginTableIndex(codexConfig, "lfp@islee23520") > pluginTableIndex(codexConfig, "lazycodex-ai"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given Codex config has unrelated blocks when setup runs then preserves them and keeps LFP after OMO", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-plugin-order-"));
  try {
    const fixture = createFixture(root);
    writeFileSync(
      path.join(fixture.codexHome, "config.toml"),
      [
        "[features]",
        "web_search = true",
        "",
        "[model_providers.custom]",
        'name = "Existing"',
        'base_url = "https://example.invalid/v1"',
        "",
        '[projects."/tmp/example"]',
        'trust_level = "trusted"',
        "",
        '[plugins."lfp@islee23520"]',
        "enabled = true",
        "",
        '[plugins."omo@sisyphuslabs"]',
        "enabled = true",
        'source = "keep-me"',
        ""
      ].join("\n")
    );

    const result = runCli(["setup", "--config", fixture.configPath], fixture.codexHome);
    const codexConfig = readFileSync(path.join(fixture.codexHome, "config.toml"), "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.match(codexConfig, /\[features]\nweb_search = true/);
    assert.match(codexConfig, /\[projects\."\/tmp\/example"]\ntrust_level = "trusted"/);
    assert.match(codexConfig, /\[model_providers\.custom]\nname = "Existing"/);
    assert.match(codexConfig, /\[plugins\."omo@sisyphuslabs"]\nenabled = true\nsource = "keep-me"/);
    assert.equal(pluginTableIndex(codexConfig, "lfp@islee23520") > pluginTableIndex(codexConfig, "omo@sisyphuslabs"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createFixture(root) {
  const codexHome = path.join(root, "codex-home");
  const sourceDir = path.join(root, "agents");
  const configPath = path.join(root, "config.json");
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(path.join(sourceDir, "explorer.toml"), 'name = "explorer"\nmodel = "grok-4.3"\n');
  writeFileSync(
    configPath,
    JSON.stringify({
      source: { agentsDir: sourceDir },
      overrides: { explorer: { model: "grok-4.3" } }
    })
  );
  return { codexHome, configPath };
}

function pluginTableIndex(text, pluginRef) {
  const index = text.indexOf(`[plugins."${pluginRef}"]`);
  assert.equal(index >= 0, true, `${pluginRef} plugin table must exist`);
  return index;
}

function runCli(args, codexHome) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      LFP_LAZYCODEX_INSTALL_BIN: process.execPath,
      LFP_LAZYCODEX_INSTALL_ARGS: JSON.stringify([LAZYCODEX_INSTALL_STUB])
    },
    encoding: "utf8"
  });
}
