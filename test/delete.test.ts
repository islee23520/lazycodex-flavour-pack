import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { formatCheckPreview, printLines } from "../src/cli/destructive-action-preview.ts";

const CLI = path.resolve("scripts/cli.mjs");
const LAZYCODEX_INSTALL_STUB = path.resolve("test/fixtures/lazycodex-install-stub.mjs");

test("given LFP is installed when delete runs then removes only LFP-owned runtime state", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-delete-"));
  try {
    const fixture = createFixture(root);
    const setup = runCli(["setup", "--config", fixture.overridePath], fixture.codexHome);
    const check = runCli(["delete", "--check"], fixture.codexHome);
    const deletion = runCli(["delete"], fixture.codexHome);
    const doctor = runCli(["doctor", "--config", fixture.overridePath], fixture.codexHome);
    const codexConfig = readFileSync(fixture.codexConfigPath, "utf8");

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(check.status, 1);
    assert.match(check.stdout, /would remove plugin files/);
    assert.equal(deletion.status, 0, deletion.stderr);
    assert.match(deletion.stdout, /removed lfp@islee23520/);
    assert.equal(doctor.status, 1);
    assert.equal(existsSync(path.join(fixture.codexHome, "local-marketplaces", "islee23520", "plugins", "lfp")), false);
    assert.equal(existsSync(path.join(fixture.codexHome, "agents", "sisyphus.toml")), false);
    assert.equal(existsSync(path.join(fixture.codexHome, "lfp.json")), true);
    assert.match(codexConfig, /\[plugins\."omo@sisyphuslabs"\]/);
    assert.match(codexConfig, /\[model_providers\.custom]/);
    assert.doesNotMatch(codexConfig, /\[mcp_servers\.lfp_tools]/);
    assert.doesNotMatch(codexConfig, /\[plugins\."lfp@islee23520"\]/);
    assert.doesNotMatch(codexConfig, /\[marketplaces\.islee23520]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given LFP marketplace contains another plugin when delete runs then marketplace config is preserved", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-delete-"));
  try {
    const fixture = createFixture(root);
    const siblingRoot = path.join(fixture.codexHome, "local-marketplaces", "islee23520", "plugins", "other");
    const setup = runCli(["setup", "--config", fixture.overridePath], fixture.codexHome);
    mkdirSync(siblingRoot, { recursive: true });

    const deletion = runCli(["delete"], fixture.codexHome);
    const codexConfig = readFileSync(fixture.codexConfigPath, "utf8");

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(deletion.status, 0, deletion.stderr);
    assert.equal(existsSync(siblingRoot), true);
    assert.match(codexConfig, /\[marketplaces\.islee23520]/);
    assert.doesNotMatch(codexConfig, /\[mcp_servers\.lfp_tools]/);
    assert.doesNotMatch(codexConfig, /\[plugins\."lfp@islee23520"\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given LFP marketplace config contains another plugin when delete runs then marketplace config is preserved", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-delete-config-sibling-"));
  try {
    const fixture = createFixture(root);
    const setup = runCli(["setup", "--config", fixture.overridePath], fixture.codexHome);
    writeFileSync(
      fixture.codexConfigPath,
      `${readFileSync(fixture.codexConfigPath, "utf8")}\n[plugins."other@islee23520"]\nenabled = true\n`
    );

    const deletion = runCli(["delete"], fixture.codexHome);
    const codexConfig = readFileSync(fixture.codexConfigPath, "utf8");

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(deletion.status, 0, deletion.stderr);
    assert.match(codexConfig, /\[marketplaces\.islee23520]/);
    assert.match(codexConfig, /\[plugins\."other@islee23520"]/);
    assert.doesNotMatch(codexConfig, /\[mcp_servers\.lfp_tools]/);
    assert.doesNotMatch(codexConfig, /\[plugins\."lfp@islee23520"]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given delete fails during config update then previous plugin is restored", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-delete-rollback-"));
  try {
    const fixture = createFixture(root);
    const setup = runCli(["setup", "--config", fixture.overridePath], fixture.codexHome);
    const pluginRoot = path.join(fixture.codexHome, "local-marketplaces", "islee23520", "plugins", "lfp");
    const pluginManifest = path.join(pluginRoot, ".codex-plugin", "plugin.json");

    assert.equal(setup.status, 0, setup.stderr);
    chmodSync(fixture.codexConfigPath, 0o444);
    const deletion = runCli(["delete"], fixture.codexHome);
    chmodSync(fixture.codexConfigPath, 0o644);

    assert.equal(deletion.status, 1);
    assert.match(deletion.stderr, /EACCES|permission denied/i);
    assert.equal(existsSync(pluginManifest), true);
    assert.match(readFileSync(fixture.codexConfigPath, "utf8"), /\[plugins\."lfp@islee23520"\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Unit tests for shared destructive preview (T3)
test("given empty actions when formatCheckPreview delete then returns exact nothing message", () => {
  const lines = formatCheckPreview("delete", []);
  assert.deepEqual(lines, ["lfp delete: nothing to remove"]);
});

test("given empty actions when formatCheckPreview undo then returns exact nothing message", () => {
  const lines = formatCheckPreview("undo", []);
  assert.deepEqual(lines, ["lfp undo: nothing to undo"]);
});

test("given non-empty actions when formatCheckPreview delete then returns header plus would-prefixed lines", () => {
  const lines = formatCheckPreview("delete", ["remove plugin files from /tmp/x", "remove marketplace foo"]);
  assert.deepEqual(lines, [
    "lfp delete: would remove:",
    "would remove plugin files from /tmp/x",
    "would remove marketplace foo"
  ]);
});

test("given non-empty actions when formatCheckPreview undo then returns restore header plus would-prefixed lines", () => {
  const lines = formatCheckPreview("undo", ["run lazycodex-ai install", "remove saved LFP model config /tmp/lfp.json"]);
  assert.deepEqual(lines, [
    "lfp undo: would restore LazyCodex original surface:",
    "would run lazycodex-ai install",
    "would remove saved LFP model config /tmp/lfp.json"
  ]);
});

test("given lines when printLines with mock output then logs each line exactly once", () => {
  const logs: string[] = [];
  const mock = { log: (l: string) => { logs.push(l); } };
  printLines(["first line", "second"], mock as any);
  assert.deepEqual(logs, ["first line", "second"]);
});

test("given empty lines when printLines then does not throw", () => {
  printLines([]);
});

function createFixture(root) {
  const codexHome = path.join(root, "codex-home");
  const agentsDir = path.join(root, "upstream-agents");
  const overridePath = path.join(root, "overrides.json");
  const codexConfigPath = path.join(codexHome, "config.toml");
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(path.join(agentsDir, "explorer.toml"), 'name = "explorer"\nmodel = "grok-4.3"\n');
  writeFileSync(
    codexConfigPath,
    [
      '[plugins."omo@sisyphuslabs"]',
      "enabled = true",
      "",
      "[model_providers.custom]",
      'base_url = "https://example.test/v1"',
      ""
    ].join("\n")
  );
  writeFileSync(
    path.join(codexHome, "lfp.json"),
    '{"schemaVersion":2,"source":{"agentsDir":"${CODEX_HOME}/agents"},"overrides":{}}\n'
  );
  writeFileSync(
    overridePath,
    JSON.stringify({
      source: { agentsDir },
      overrides: { explorer: { model: "grok-4.3" } }
    })
  );
  return { codexConfigPath, codexHome, overridePath };
}

function runCli(args, codexHome) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      HOME: path.dirname(codexHome),
      LFP_LAZYCODEX_INSTALL_BIN: process.execPath,
      LFP_LAZYCODEX_INSTALL_ARGS: JSON.stringify([LAZYCODEX_INSTALL_STUB])
    },
    encoding: "utf8"
  });
}
