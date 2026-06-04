import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { applyModelOverrides, readOverrideConfig, syncAgentOverrides } from "../scripts/sync-agent-overrides.mjs";

test("given vanilla agent text when applying overrides then only model fields change", () => {
  const source = [
    'name = "explorer"',
    'description = "Codebase search specialist"',
    'nickname_candidates = ["Explorer"]',
    'model = "gpt-5.4-mini"',
    'model_reasoning_effort = "medium"',
    'service_tier = "default"',
    "",
    'developer_instructions = """keep me"""',
    ""
  ].join("\n");

  const result = applyModelOverrides(source, {
    model: "grok-4.3",
    model_reasoning_effort: "low",
    service_tier: "fast"
  });

  assert.match(result, /model = "grok-4\.3"/);
  assert.match(result, /model_reasoning_effort = "low"/);
  assert.match(result, /service_tier = "fast"/);
  assert.match(result, /developer_instructions = """keep me"""/);
});

test("given source dir and override config when syncing then updates source agent config in place", () => {
  const root = mkdtempSync(path.join(tmpdir(), "linalab-agent-sync-"));
  try {
    const sourceDir = path.join(root, "source");
    const configPath = path.join(root, "config.json");
    mkdirSync(sourceDir);
    writeFileSync(path.join(sourceDir, "explorer.toml"), 'name = "explorer"\nmodel = "gpt-5.4-mini"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = syncAgentOverrides(configPath);
    const updated = readFileSync(path.join(sourceDir, "explorer.toml"), "utf8");

    assert.equal(result.changed.length, 1);
    assert.match(updated, /model = "grok-4\.3"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given TOML override config when reading then maps agents dir and model fields", () => {
  const root = mkdtempSync(path.join(tmpdir(), "linalab-agent-sync-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(
      configPath,
      [
        "[source]",
        'agents_dir = "/tmp/omo-agents"',
        "",
        "[agents.explorer]",
        'model = "grok-4.3"',
        'model_reasoning_effort = "low"',
        'service_tier = "fast"',
        ""
      ].join("\n")
    );

    const config = readOverrideConfig(configPath);

    assert.equal(config.source.agentsDir, "/tmp/omo-agents");
    assert.deepEqual(config.overrides.explorer, {
      model: "grok-4.3",
      model_reasoning_effort: "low",
      service_tier: "fast"
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given packaged override config when reading then targets Codex-loaded agents directory", () => {
  const config = readOverrideConfig(path.resolve("agent-configs/omo-agent-model-overrides.toml"));

  assert.equal(config.source.agentsDir, "/Users/ilseoblee/.codex/agents");
  assert.equal(config.overrides.explorer.model, "grok-4.20-0309-non-reasoning");
  assert.deepEqual(config.overrides.librarian, {
    model: "gpt-5.4-mini",
    model_reasoning_effort: "low",
    service_tier: "fast"
  });
});

test("given check mode when syncing then reports pending changes without writing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "linalab-agent-sync-"));
  try {
    const sourceDir = path.join(root, "source");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "gpt-5.4-mini"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = syncAgentOverrides(configPath, { check: true });
    const unchanged = readFileSync(agentPath, "utf8");

    assert.deepEqual(result.changed, [agentPath]);
    assert.match(unchanged, /model = "gpt-5\.4-mini"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given missing agents dir when syncing then reports install or update guidance", () => {
  const root = mkdtempSync(path.join(tmpdir(), "linalab-agent-sync-"));
  try {
    const configPath = path.join(root, "config.json");
    const sourceDir = path.join(root, "missing-source");
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    assert.throws(
      () => syncAgentOverrides(configPath),
      /agents_dir does not exist.*LazyCodex\/OMO is not installed or the configured agents_dir is stale.*Install or update LazyCodex\.ai\/OMO first/i
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given missing override config when syncing then reports the missing config path", () => {
  const configPath = path.join(tmpdir(), "missing-lfp-overrides.json");

  assert.throws(
    () => syncAgentOverrides(configPath),
    new RegExp(`Override config does not exist: ${configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
  );
});

test("given missing required agent TOML when syncing then reports incomplete install and does not create files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "linalab-agent-sync-"));
  try {
    const sourceDir = path.join(root, "source");
    const configPath = path.join(root, "config.json");
    const missingAgentPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    assert.throws(
      () => syncAgentOverrides(configPath),
      new RegExp(
        `incomplete or stale.*Missing required agent TOML files: ${missingAgentPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*Install or update LazyCodex\\.ai/OMO first`,
        "i"
      )
    );
    assert.equal(existsSync(missingAgentPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
