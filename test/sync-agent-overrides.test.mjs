import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  applyModelOverrides,
  readOverrideConfig,
  syncAgentOverrides,
  syncGlobalModelDefaults
} from "../scripts/sync-agent-overrides.mjs";

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
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
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
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
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

test("given invalid override config when reading then reports schema validation issue", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
  try {
    const configPath = path.join(root, "overrides.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: "/tmp/omo-agents" },
        overrides: { explorer: { model: 123 } }
      })
    );

    assert.throws(() => readOverrideConfig(configPath), /Invalid model override config.*overrides\.explorer\.model/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given packaged override config when reading then targets Codex-loaded agents directory", () => {
  const codexHome = path.join(tmpdir(), "lfp-codex-home");
  const config = readOverrideConfig(path.resolve("agent-configs/omo-agent-model-overrides.toml"), {
    env: { ...process.env, CODEX_HOME: codexHome }
  });

  assert.equal(config.source.agentsDir, path.join(codexHome, "agents"));
  assert.deepEqual(config.overrides.default, {
    model: "gpt-5.5",
    model_reasoning_effort: "high",
    service_tier: "default"
  });
  assert.deepEqual(config.overrides.ulw, {
    model: "gpt-5.5",
    model_reasoning_effort: "xhigh",
    service_tier: "default"
  });
  assert.equal(config.overrides.explorer.model, "gpt-5.4-mini");
  assert.deepEqual(config.overrides.librarian, {
    model: "gpt-5.4-mini",
    model_reasoning_effort: "low",
    service_tier: "fast",
    model_fallback: "grok-3-mini-fast",
    model_fallback_reasoning_effort: "low",
    model_fallback_service_tier: "default"
  });
});

test("given legacy JSON override config with CODEX_HOME token when reading then resolves the active Codex agents directory", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
  try {
    const configPath = path.join(root, "overrides.json");
    const codexHome = path.join(root, "codex-home");
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: "${CODEX_HOME}/agents" },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const config = readOverrideConfig(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome }
    });

    assert.equal(config.source.agentsDir, path.join(codexHome, "agents"));
    assert.deepEqual(config.overrides.explorer, { model: "grok-4.3" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given check mode when syncing then reports pending changes without writing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
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
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
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
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
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

test("given only agent-specific overrides when syncing global defaults then leaves Codex default model unchanged", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-global-defaults-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    const configPath = path.join(root, "overrides.toml");
    const globalConfigPath = path.join(codexHome, "config.toml");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      globalConfigPath,
      ['model = "gpt-5.5"', 'model_reasoning_effort = "medium"', 'service_tier = "default"', ""].join("\n")
    );
    writeFileSync(
      configPath,
      [
        "[source]",
        'agents_dir = "${CODEX_HOME}/agents"',
        "",
        "[agents.explorer]",
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "low"',
        'service_tier = "default"',
        "",
        "[agents.librarian]",
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "low"',
        'service_tier = "default"',
        ""
      ].join("\n")
    );

    const result = syncGlobalModelDefaults(configPath, { env: { ...process.env, CODEX_HOME: codexHome } });

    assert.deepEqual(result.changed, []);
    assert.match(readFileSync(globalConfigPath, "utf8"), /model = "gpt-5\.5"/);
    assert.doesNotMatch(readFileSync(globalConfigPath, "utf8"), /grok-4\.20-0309-non-reasoning/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given default and ULW override sections when syncing global defaults then updates only top-level and ULW profile fields", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-global-defaults-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    const configPath = path.join(root, "overrides.toml");
    const globalConfigPath = path.join(codexHome, "config.toml");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      globalConfigPath,
      [
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "low"',
        'service_tier = "fast"',
        "",
        "[profiles.ulw]",
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "low"',
        'service_tier = "fast"',
        "",
        "[profiles.other]",
        'model = "keep-me"',
        ""
      ].join("\n")
    );
    writeFileSync(
      configPath,
      [
        "[source]",
        'agents_dir = "${CODEX_HOME}/agents"',
        "",
        "[agents.default]",
        'model = "gpt-5.5"',
        'model_reasoning_effort = "high"',
        'service_tier = "default"',
        "",
        "[agents.ulw]",
        'model = "gpt-5.5"',
        'model_reasoning_effort = "xhigh"',
        'service_tier = "default"',
        ""
      ].join("\n")
    );

    const result = syncGlobalModelDefaults(configPath, { env: { ...process.env, CODEX_HOME: codexHome } });
    const updated = readFileSync(globalConfigPath, "utf8");

    assert.deepEqual(result.changed, [globalConfigPath]);
    assert.match(updated, /^model = "gpt-5\.5"\nmodel_reasoning_effort = "high"\nservice_tier = "default"/);
    assert.match(updated, /\[profiles\.ulw]\nmodel = "gpt-5\.5"\nmodel_reasoning_effort = "xhigh"\nservice_tier = "default"/);
    assert.match(updated, /\[profiles\.other]\nmodel = "keep-me"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
