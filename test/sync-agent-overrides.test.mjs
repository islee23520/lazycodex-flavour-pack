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

test("given fallback model overrides when applying agent overrides then preserves installed fallback fields", () => {
  const source = [
    'name = "explorer"',
    'description = "Codebase search specialist"',
    'model = "gpt-5.4-mini"',
    'model_reasoning_effort = "medium"',
    'service_tier = "default"',
    'model_fallback = "old-fallback"',
    "",
    'developer_instructions = """keep me"""',
    ""
  ].join("\n");

  const result = applyModelOverrides(source, {
    model: "grok-4.3",
    model_reasoning_effort: "low",
    service_tier: "fast",
    model_fallback: "grok-3-mini-fast",
    model_fallback_reasoning_effort: "low",
    model_fallback_service_tier: "default"
  });

  assert.match(result, /model = "grok-4\.3"/);
  assert.match(result, /model_reasoning_effort = "low"/);
  assert.match(result, /service_tier = "fast"/);
  assert.match(result, /^model_fallback = "old-fallback"$/m);
  assert.doesNotMatch(result, /grok-3-mini-fast/);
  assert.match(result, /developer_instructions = """keep me"""/);
});

test("given upstream agent override config when syncing then writes supported model fields", () => {
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

    assert.deepEqual(result.changed, [path.join(sourceDir, "explorer.toml")]);
    assert.deepEqual(result.skippedReadOnly, []);
    assert.match(updated, /model = "grok-4\.3"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given TOML override config with fallback fields when syncing then preserves installed fallback fields", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
  try {
    const sourceDir = path.join(root, "source");
    const configPath = path.join(root, "overrides.toml");
    const agentPath = path.join(sourceDir, "plan.toml");
    mkdirSync(sourceDir);
    writeFileSync(
      agentPath,
      [
        'name = "plan"',
        'model = "old"',
        'model_reasoning_effort = "medium"',
        'service_tier = "default"',
        'model_fallback = "old-fallback"',
        ""
      ].join("\n")
    );
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${sourceDir}"`,
        "",
        "[agents.plan]",
        'model = "new"',
        'model_reasoning_effort = "low"',
        'service_tier = "fast"',
        'model_fallback = "fallback"',
        'model_fallback_reasoning_effort = "low"',
        'model_fallback_service_tier = "default"',
        ""
      ].join("\n")
    );

    const result = syncAgentOverrides(configPath);
    const updated = readFileSync(agentPath, "utf8");

    assert.deepEqual(result.changed, [agentPath]);
    assert.deepEqual(result.skippedReadOnly, []);
    assert.match(updated, /model = "new"/);
    assert.match(updated, /model_reasoning_effort = "low"/);
    assert.match(updated, /service_tier = "fast"/);
    assert.match(updated, /^model_fallback = "old-fallback"$/m);
    assert.doesNotMatch(updated, /model_fallback = "fallback"/);
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
    model_reasoning_effort: "medium",
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
    service_tier: "fast"
  });
  assert.deepEqual(Object.keys(config.overrides).sort(), [
    "default",
    "explorer",
    "lazycodex-clone-fidelity-reviewer",
    "lazycodex-code-reviewer",
    "lazycodex-executor",
    "lazycodex-gate-reviewer",
    "lazycodex-qa-executor",
    "librarian",
    "metis",
    "momus",
    "plan",
    "ulw"
  ]);
  assert.equal(Object.keys(config.overrides).filter((agentName) => !["default", "ulw"].includes(agentName)).length, 10);
  assert.deepEqual(config.overrides.momus, {
    model: "gpt-5.5",
    model_reasoning_effort: "xhigh",
    service_tier: "default"
  });
  assert.deepEqual(config.overrides.plan, {
    model: "gpt-5.5",
    model_reasoning_effort: "xhigh",
    service_tier: "default"
  });
  assert.deepEqual(config.overrides["lazycodex-code-reviewer"], {
    model: "gpt-5.5",
    model_reasoning_effort: "xhigh",
    service_tier: "default"
  });
  assert.deepEqual(config.overrides["lazycodex-qa-executor"], {
    model: "gpt-5.5",
    model_reasoning_effort: "medium",
    service_tier: "default"
  });
});

test("given configured OMO agents in override config when syncing then writes model fields to agent TOMLs", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
  try {
    const sourceDir = path.join(root, "source");
    const configPath = path.join(root, "overrides.toml");
    const planPath = path.join(sourceDir, "plan.toml");
    const metisPath = path.join(sourceDir, "metis.toml");
    mkdirSync(sourceDir);
    writeFileSync(
      planPath,
      ['name = "plan"', 'model = "old"', 'model_reasoning_effort = "low"', 'service_tier = "fast"', ""].join("\n")
    );
    writeFileSync(
      metisPath,
      ['name = "metis"', 'model = "old"', 'model_reasoning_effort = "low"', 'service_tier = "fast"', ""].join("\n")
    );
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${sourceDir}"`,
        "",
        "[agents.plan]",
        'model = "grok-4.20-0309-reasoning"',
        'model_reasoning_effort = "xhigh"',
        'service_tier = "default"',
        "",
        "[agents.metis]",
        'model = "gpt-5.5"',
        'model_reasoning_effort = "high"',
        'service_tier = "default"',
        ""
      ].join("\n")
    );

    const result = syncAgentOverrides(configPath);
    const updatedPlan = readFileSync(planPath, "utf8");
    const updatedMetis = readFileSync(metisPath, "utf8");

    assert.deepEqual(result.changed.toSorted(), [metisPath, planPath].toSorted());
    assert.deepEqual(result.skippedReadOnly, []);
    assert.match(updatedPlan, /^model = "grok-4\.20-0309-reasoning"$/m);
    assert.match(updatedPlan, /^model_reasoning_effort = "xhigh"$/m);
    assert.match(updatedPlan, /^service_tier = "default"$/m);
    assert.match(updatedMetis, /^model = "gpt-5\.5"$/m);
    assert.match(updatedMetis, /^model_reasoning_effort = "high"$/m);
    assert.match(updatedMetis, /^service_tier = "default"$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given mixed upstream overrides when syncing then writes all configured existing agents", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
  try {
    const sourceDir = path.join(root, "source");
    const configPath = path.join(root, "config.json");
    const explorerPath = path.join(sourceDir, "explorer.toml");
    const metisPath = path.join(sourceDir, "metis.toml");
    mkdirSync(sourceDir);
    writeFileSync(explorerPath, 'name = "explorer"\nmodel = "upstream-original"\n');
    writeFileSync(metisPath, 'name = "metis"\nmodel = "metis-original"\n');
    const originalExplorer = readFileSync(explorerPath, "utf8");
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: {
          explorer: { model: "explorer-updated" },
          metis: { model: "metis-updated" }
        }
      })
    );

    const result = syncAgentOverrides(configPath);

    assert.deepEqual(result.changed.toSorted(), [explorerPath, metisPath].toSorted());
    assert.deepEqual(result.skippedReadOnly, []);
    assert.notEqual(readFileSync(explorerPath, "utf8"), originalExplorer);
    assert.match(readFileSync(metisPath, "utf8"), /^model = "metis-updated"$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given upstream agent TOML exists when syncing then writes configured model fields", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
  try {
    const sourceDir = path.join(root, "source");
    const configPath = path.join(root, "config.json");
    const explorerPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    const original = 'name = "explorer"\nmodel = "original"\n# keep exact bytes\n';
    writeFileSync(explorerPath, original);
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "new-model", model_reasoning_effort: "high" } }
      })
    );

    const result = syncAgentOverrides(configPath);

    assert.deepEqual(result.changed, [explorerPath]);
    assert.deepEqual(result.skippedReadOnly, []);
    assert.notEqual(readFileSync(explorerPath, "utf8"), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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

test("given check mode with upstream agent when syncing then reports pending write without modifying", () => {
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
    assert.deepEqual(result.skippedReadOnly, []);
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

test("given missing required configured agent TOML when syncing then reports incomplete install and does not create files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
  try {
    const sourceDir = path.join(root, "source");
    const configPath = path.join(root, "config.json");
    const missingAgentPath = path.join(sourceDir, "plan.toml");
    mkdirSync(sourceDir);
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { plan: { model: "grok-4.3" } }
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

test("given stale saved config includes removed LFP agents when syncing then ignores those entries", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-agent-sync-"));
  try {
    const sourceDir = path.join(root, "source");
    const configPath = path.join(root, "config.json");
    const explorerPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(explorerPath, 'name = "explorer"\nmodel = "old"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: {
          explorer: { model: "new" },
          sisyphus: { model: "legacy-sisyphus" },
          "visual-engineering": { model: "legacy-vision" },
          artistry: { model: "legacy-art" }
        }
      })
    );

    const result = syncAgentOverrides(configPath);

    assert.deepEqual(result.changed, [explorerPath]);
    assert.deepEqual(result.skippedReadOnly, []);
    assert.match(readFileSync(explorerPath, "utf8"), /^model = "new"$/m);
    assert.equal(existsSync(path.join(sourceDir, "sisyphus.toml")), false);
    assert.equal(existsSync(path.join(sourceDir, "visual-engineering.toml")), false);
    assert.equal(existsSync(path.join(sourceDir, "artistry.toml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given fallback fields in default and ulw overrides when syncing global defaults then ignores fallback fields", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-global-defaults-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    const configPath = path.join(root, "overrides.toml");
    const globalConfigPath = path.join(codexHome, "config.toml");
    const ulwConfigPath = path.join(codexHome, "ulw.config.toml");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(globalConfigPath, '[profiles.ulw]\nmodel = "old-ulw"\n');
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${agentsDir}"`,
        "",
        "[agents.default]",
        'model = "default-primary"',
        'model_reasoning_effort = "high"',
        'service_tier = "default"',
        'model_fallback = "default-fallback"',
        'model_fallback_reasoning_effort = "low"',
        'model_fallback_service_tier = "default"',
        "",
        "[agents.ulw]",
        'model = "ulw-primary"',
        'model_reasoning_effort = "xhigh"',
        'service_tier = "default"',
        'model_fallback = "ulw-fallback"',
        'model_fallback_reasoning_effort = "low"',
        'model_fallback_service_tier = "default"',
        ""
      ].join("\n")
    );

    const result = syncGlobalModelDefaults(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome }
    });
    const updated = readFileSync(globalConfigPath, "utf8");
    const updatedUlw = readFileSync(ulwConfigPath, "utf8");

    assert.deepEqual(result.changed, [globalConfigPath, ulwConfigPath]);
    assert.match(updated, /^model = "default-primary"$/m);
    assert.match(updated, /^model_reasoning_effort = "high"$/m);
    assert.match(updated, /^service_tier = "default"$/m);
    assert.doesNotMatch(updated, /^\[profiles\.ulw]$/m);
    assert.match(updatedUlw, /^model = "ulw-primary"$/m);
    assert.match(updatedUlw, /^model_reasoning_effort = "xhigh"$/m);
    assert.match(updatedUlw, /^service_tier = "default"$/m);
    assert.doesNotMatch(updated, /model_fallback/);
    assert.doesNotMatch(updatedUlw, /model_fallback/);
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
    const ulwConfigPath = path.join(codexHome, "ulw.config.toml");
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
    const updatedUlw = readFileSync(ulwConfigPath, "utf8");

    assert.deepEqual(result.changed, [globalConfigPath, ulwConfigPath]);
    assert.match(updated, /^model = "gpt-5\.5"\nmodel_reasoning_effort = "high"\nservice_tier = "default"/);
    assert.doesNotMatch(updated, /^\[profiles\.ulw]$/m);
    assert.match(updatedUlw, /^model = "gpt-5\.5"\nmodel_reasoning_effort = "xhigh"\nservice_tier = "default"/);
    assert.match(updated, /\[profiles\.other]\nmodel = "keep-me"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
