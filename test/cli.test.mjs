import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

import { parseSyncArgs } from "../scripts/cli-args.mjs";
import { clearRolePolicyConfigCache } from "../scripts/role-policy-config.mjs";
import { escapeRegExp } from "../scripts/toml-string-utils.mjs";

const CLI = path.resolve("scripts/cli.mjs");
const LAZYCODEX_INSTALL_STUB = path.resolve("test/fixtures/lazycodex-install-stub.mjs");

test("given npx-style CLI setup when upstream agent exists then updates configured fields", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "gpt-5.4-mini"\ndeveloper_instructions = """keep me"""\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "setup", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });
    const updated = readFileSync(agentPath, "utf8");
    const codexConfig = readFileSync(path.join(codexHome, "config.toml"), "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /lazycodex-ai install stub/);
    assert.match(result.stdout, /installed lfp@islee23520/);
    assert.equal(result.stdout.indexOf("lazycodex-ai install stub") < result.stdout.indexOf("installed lfp@islee23520"), true);
    assert.match(result.stdout, /updated .*explorer\.toml/);
    assert.match(updated, /model = "grok-4\.3"/);
    assert.match(updated, /developer_instructions = """keep me"""/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp", ".codex-plugin", "plugin.json")), true);
    assert.equal(existsSync(path.join(codexHome, "agents", "sisyphus.toml")), true);
    assert.equal(existsSync(path.join(codexHome, "agents", "visual-engineering.toml")), true);
    assert.equal(existsSync(path.join(codexHome, "agents", "visual-looker.toml")), true);
    assert.match(codexConfig, /\[marketplaces\.islee23520\]/);
    assert.match(codexConfig, /\[plugins\."lfp@islee23520"\]/);
    assert.match(codexConfig, /enabled = true/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given local CLI setup skips LazyCodex install when requested then installs checkout files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
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

    const result = spawnSync(
      process.execPath,
      [CLI, "setup", "--config", configPath, "--skip-model-prompt", "--skip-lazycodex-install"],
      {
        env: cliEnv(codexHome),
        encoding: "utf8"
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /skipping LazyCodex install; using local LFP checkout files/);
    assert.doesNotMatch(result.stdout, /lazycodex-ai install stub/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp", "scripts", "cli.mjs")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given saved LFP overrides when setup skips model prompt then applies all saved agents", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    const savedPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(path.dirname(savedPath), { recursive: true });
    writeOmo410AgentFixtureSet(agentsDir, { metis: { model: "gpt-5.5" } });
    writeFileSync(
      savedPath,
      savedOverrideJson({
        explorer: {
          model: "grok-4.3",
          model_reasoning_effort: "low",
          service_tier: "default"
        },
        metis: {
          model: "custom-metis-model",
          model_reasoning_effort: "high",
          service_tier: "default"
        }
      })
    );

    const result = spawnSync(
      process.execPath,
      [CLI, "setup", "--skip-model-prompt", "--skip-lazycodex-install"],
      {
        env: { ...process.env, CODEX_HOME: codexHome },
        encoding: "utf8"
      }
    );
    const metisText = readFileSync(path.join(agentsDir, "metis.toml"), "utf8");
    const installedOverrideText = readFileSync(
      path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp", "agent-configs", "omo-agent-model-overrides.toml"),
      "utf8"
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /applied saved LFP model override config.*\(non-interactive\)/);
    assert.match(result.stdout, /updated .*metis\.toml/);
    assert.match(metisText, /model = "custom-metis-model"/);
    assert.match(installedOverrideText, /agents_dir = "\$\{CODEX_HOME}\/agents"/);
    assert.match(installedOverrideText, /\[agents\.metis]/);
    assert.doesNotMatch(installedOverrideText, new RegExp(escapeRegExp(root)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given no saved user override when interactive setup runs then emits no Adjust prompt and no per-agent model questions", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeOmo410AgentFixtureSet(agentsDir, { metis: { model: "custom-metis-model" } });
    // no saved override file present -> default interactive path must stay silent and let final sync apply packaged defaults

    const result = spawnSync(
      process.execPath,
      [CLI, "setup", "--skip-lazycodex-install", "--config", "agent-configs/omo-agent-model-overrides.toml"],
      {
        env: { ...process.env, CODEX_HOME: codexHome },
        encoding: "utf8"
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Adjust LFP model overrides now/i);
    assert.doesNotMatch(result.stdout, /explorer model|librarian model|=== OMO Agent Model Overrides ===/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given no saved user override when interactive setup runs then final sync applies the packaged agent-configs defaults", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeOmo410AgentFixtureSet(agentsDir, { metis: { model: "custom-metis-model" } });

    const result = spawnSync(
      process.execPath,
      [CLI, "setup", "--skip-lazycodex-install", "--config", "agent-configs/omo-agent-model-overrides.toml"],
      {
        env: { ...process.env, CODEX_HOME: codexHome },
        encoding: "utf8"
      }
    );

    const explorerText = readFileSync(path.join(agentsDir, "explorer.toml"), "utf8");
    const librarianText = readFileSync(path.join(agentsDir, "librarian.toml"), "utf8");
    const metisText = readFileSync(path.join(agentsDir, "metis.toml"), "utf8");
    const momusText = readFileSync(path.join(agentsDir, "momus.toml"), "utf8");
    const planText = readFileSync(path.join(agentsDir, "plan.toml"), "utf8");
    const reviewerText = readFileSync(path.join(agentsDir, "codex-ultrawork-reviewer.toml"), "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /updated .*metis\.toml/);
    assert.match(explorerText, /model = "gpt-5.4-mini"/);
    assert.match(explorerText, /model_reasoning_effort = "low"/);
    assert.match(librarianText, /model = "gpt-5\.4-mini"/);
    assert.match(librarianText, /model_reasoning_effort = "low"/);
    assert.match(metisText, /model = "gpt-5\.5"/);
    assert.match(metisText, /model_reasoning_effort = "high"/);
    assert.match(momusText, /model_reasoning_effort = "xhigh"/);
    assert.match(planText, /model_reasoning_effort = "xhigh"/);
    assert.match(reviewerText, /model_reasoning_effort = "high"/);
    assert.doesNotMatch(`${explorerText}\n${librarianText}\n${metisText}\n${momusText}\n${planText}\n${reviewerText}`, /model_fallback/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given saved LFP overrides when dry setup runs then reports no override drift", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    const savedPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(path.dirname(savedPath), { recursive: true });
    writeFileSync(path.join(agentsDir, "explorer.toml"), 'name = "explorer"\nmodel = "grok-4.3"\n');
    writeFileSync(path.join(agentsDir, "metis.toml"), 'name = "metis"\nmodel = "custom-metis-model"\n');
    writeFileSync(
      savedPath,
      savedOverrideJson({
        explorer: { model: "grok-4.3" },
        metis: { model: "custom-metis-model" }
      })
    );

    const result = spawnSync(
      process.execPath,
      [CLI, "dry-setup", "--skip-model-prompt", "--skip-lazycodex-install"],
      {
        env: { ...process.env, CODEX_HOME: codexHome },
        encoding: "utf8"
      }
    );

    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /would update .*explorer\.toml/);
    assert.doesNotMatch(result.stdout, /would update .*metis\.toml/);
    assert.doesNotMatch(result.stdout, /would update global model defaults/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given setup args when parsing applier mode flags then exposes agent-only default and explicit global sync", () => {
  assert.deepEqual(parseSyncArgs(["--agent-models-only"]), { agentModelsOnly: true });
  assert.deepEqual(parseSyncArgs(["--sync-global-defaults"]), { syncGlobalDefaults: true });
  assert.throws(() => parseSyncArgs(["--agent-models-only", "--sync-global-defaults"]), /cannot be combined/);
});

test("given saved LFP overrides when doctor runs then checks saved agent set", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    const savedPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(path.dirname(savedPath), { recursive: true });
    writeFileSync(path.join(agentsDir, "explorer.toml"), 'name = "explorer"\nmodel = "grok-4.3"\n');
    writeFileSync(path.join(agentsDir, "metis.toml"), 'name = "metis"\nmodel = "custom-metis-model"\n');
    writeFileSync(
      savedPath,
      savedOverrideJson({
        explorer: { model: "grok-4.3" },
        metis: { model: "custom-metis-model" }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "doctor"], {
      env: { ...process.env, CODEX_HOME: codexHome },
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /agent overrides: already applied/);
    assert.doesNotMatch(result.stdout, /would update .*explorer\.toml/);
    assert.doesNotMatch(result.stdout, /would update .*metis\.toml/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given Korean postposition is attached to setup flag when CLI runs then accepts the intended flag", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
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

    const result = spawnSync(process.execPath, [CLI, "setup", "--config", configPath, "--skip-model-prompt를"], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /installed lfp@islee23520/);
    assert.doesNotMatch(result.stderr, /Unknown sync option/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given npx-style CLI dry-setup when changes are pending then exits nonzero without writing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
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

    const result = spawnSync(process.execPath, [CLI, "dry-setup", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });
    const unchanged = readFileSync(agentPath, "utf8");

    assert.equal(result.status, 1);
    assert.match(result.stdout, /would install plugin files/);
    assert.match(result.stdout, /would install LFP agents/);
    assert.match(result.stdout, /would update .*explorer\.toml/);
    assert.match(unchanged, /model = "gpt-5\.4-mini"/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given setup applies agent overrides when Codex defaults and OMO hook state exist then syncs defaults and preserves hook state", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-preserve-"));
  try {
    const fixture = createPreservationFixture(root);
    const beforeConfig = readFileSync(fixture.codexConfigPath, "utf8");
    const beforeHookStateHash = hookStateHash(beforeConfig);

    const result = spawnSync(
      process.execPath,
      [CLI, "setup", "--config", fixture.configPath, "--skip-model-prompt", "--skip-lazycodex-install"],
      {
        env: { ...process.env, CODEX_HOME: fixture.codexHome, HOME: root },
        encoding: "utf8"
      }
    );
    const afterConfig = readFileSync(fixture.codexConfigPath, "utf8");
    const updatedAgent = readFileSync(fixture.agentPath, "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.match(updatedAgent, /model = "grok-4\.3"/);
    assertCodexDefaultsSynced(afterConfig);
    assert.equal(hookStateHash(afterConfig), beforeHookStateHash);
    assert.match(afterConfig, /\[hooks\."UserPromptSubmit"\."omo@sisyphuslabs\/visual-qa"]\ncommand = "omo visual qa"\nenabled = true/);
    assert.match(afterConfig, /\[hook_state\."omo@sisyphuslabs\/session-start"]\nlast_status = "ok"\nupdated_at = "2026-06-15T00:00:00Z"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given setup explicitly syncs global defaults then updates Codex defaults from virtual override sections", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-global-sync-"));
  try {
    const fixture = createPreservationFixture(root);

    const result = spawnSync(
      process.execPath,
      [
        CLI,
        "setup",
        "--config",
        fixture.configPath,
        "--skip-model-prompt",
        "--skip-lazycodex-install",
        "--sync-global-defaults"
      ],
      {
        env: { ...process.env, CODEX_HOME: fixture.codexHome, HOME: root },
        encoding: "utf8"
      }
    );
    const afterConfig = readFileSync(fixture.codexConfigPath, "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /updated global model defaults in .*config\.toml/);
    assert.match(afterConfig, /^model = "packaged-default"$/m);
    assert.match(afterConfig, /^model_reasoning_effort = "high"$/m);
    assert.match(afterConfig, /^service_tier = "default"$/m);
    assert.match(afterConfig, /\[profiles\.ulw]\nmodel = "packaged-ulw"\nmodel_reasoning_effort = "xhigh"\nservice_tier = "default"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given agent-config applies agent overrides by default then syncs Codex defaults", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-agent-config-"));
  try {
    const fixture = createPreservationTomlFixture(root);

    const result = spawnSync(process.execPath, [CLI, "agent-config", "--config", fixture.configPath], {
      env: { ...process.env, CODEX_HOME: fixture.codexHome, HOME: root },
      input: "\n".repeat(9),
      encoding: "utf8"
    });
    const afterConfig = readFileSync(fixture.codexConfigPath, "utf8");
    const updatedAgent = readFileSync(fixture.agentPath, "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /updated global model defaults in .*config\.toml/);
    assertCodexDefaultsSynced(afterConfig);
    assert.match(updatedAgent, /model = "grok-4\.3"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given agent-config explicitly syncs global defaults then virtual sections update Codex defaults", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-agent-config-global-"));
  try {
    const fixture = createPreservationTomlFixture(root);

    const result = spawnSync(process.execPath, [CLI, "agent-config", "--config", fixture.configPath, "--sync-global-defaults"], {
      env: { ...process.env, CODEX_HOME: fixture.codexHome, HOME: root },
      input: "\n".repeat(9),
      encoding: "utf8"
    });
    const afterConfig = readFileSync(fixture.codexConfigPath, "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /updated global model defaults in .*config\.toml/);
    assert.match(afterConfig, /^model = "packaged-default"$/m);
    assert.match(afterConfig, /\[profiles\.ulw]\nmodel = "packaged-ulw"\nmodel_reasoning_effort = "xhigh"\nservice_tier = "default"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given agent-config receives conflicting applier flags then rejects them before writing", () => {
  const result = spawnSync(process.execPath, [CLI, "agent-config", "--agent-models-only", "--sync-global-defaults"], {
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot be combined/);
});

test("given dry setup sees Codex defaults and OMO hook state then reports pending agent changes without writing config", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-preserve-"));
  try {
    const fixture = createPreservationFixture(root);
    const beforeConfig = readFileSync(fixture.codexConfigPath, "utf8");
    const beforeHash = sha256(beforeConfig);

    const result = spawnSync(process.execPath, [CLI, "dry-setup", "--config", fixture.configPath], {
      env: { ...process.env, CODEX_HOME: fixture.codexHome, HOME: root },
      encoding: "utf8"
    });
    const afterConfig = readFileSync(fixture.codexConfigPath, "utf8");
    const unchangedAgent = readFileSync(fixture.agentPath, "utf8");

    assert.equal(result.status, 1);
    assert.match(result.stdout, /would update .*explorer\.toml/);
    assert.match(result.stdout, /global defaults: synced \(default mode\)/);
    assert.match(result.stdout, /would update global model defaults in .*config\.toml/);
    assert.equal(sha256(afterConfig), beforeHash);
    assert.match(unchangedAgent, /model = "gpt-5\.4-mini"/);
    assertCodexDefaultsPreserved(afterConfig);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given dry setup cannot fetch provider inventory then reports degraded visibility and preserves current values", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-dry-provider-"));
  try {
    const fixture = createDoctorProviderFixture(root, "http://127.0.0.1:9/v1");

    const result = spawnSync(process.execPath, [CLI, "dry-setup", "--config", fixture.configPath], {
      env: { ...process.env, CODEX_HOME: fixture.codexHome, HOME: root },
      encoding: "utf8"
    });
    const unchangedAgent = readFileSync(fixture.agentPath, "utf8");

    assert.equal(result.status, 1);
    assert.match(result.stdout, /active provider id: cliproxyapi/);
    assert.match(result.stdout, /provider inventory: degraded visibility/);
    assert.match(result.stdout, /keeping current saved\/configured values; manual model entry remains available/);
    assert.match(result.stdout, /global defaults: synced \(default mode\)/);
    assert.match(result.stdout, /OMO hook state: preserved/);
    assert.match(result.stdout, /agent model drift: explorer: model/);
    assert.doesNotMatch(result.stdout, /provider overwrite|configure OpenAI-compatible provider/);
    assert.doesNotMatch(result.stdout, /sk-test-secret-DO-NOT-PRINT|Bearer sk-test-secret/);
    assert.match(unchangedAgent, /model_fallback = "old-fallback"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given benchmark apply writes saved overrides then reports global defaults are preserved", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-benchmark-"));
  try {
    const fixture = createBenchmarkApplyFixture(root);

    const result = spawnSync(
      process.execPath,
      [
        CLI,
        "benchmark-models",
        "--recommend-only",
        "--apply",
        "--roles",
        "explorer",
        "--models",
        "slow-model,grok-3-mini-fast",
        "--output",
        fixture.outputPath
      ],
      {
        env: { ...process.env, CODEX_HOME: fixture.codexHome, HOME: root },
        encoding: "utf8"
      }
    );
    const afterConfig = readFileSync(fixture.codexConfigPath, "utf8");
    const saved = JSON.parse(readFileSync(fixture.savedPath, "utf8"));

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /applied 1 override updates/);
    assert.match(result.stdout, /global defaults: preserved \(agent-only mode\)/);
    assert.match(afterConfig, /^model = "hephaestus-default"$/m);
    assert.equal(saved.overrides.explorer.model, "grok-3-mini-fast");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given CLI help when invoked then documents npx usage", () => {
  const result = spawnSync(process.execPath, [CLI, "help"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npx @islee23520\/lfp@latest setup/);
  assert.match(result.stdout, /npx @islee23520\/lfp@latest dry-setup/);
  assert.match(result.stdout, /npx @islee23520\/lfp@latest doctor/);
  assert.match(result.stdout, /npx @islee23520\/lfp@latest agent-config/);
  assert.match(result.stdout, /runs npx lazycodex-ai install before applying LFP/);
  assert.match(result.stdout, /--no-tui/);
});

test("given setup config is missing when setup runs then leaves Codex home unmodified", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "missing.json");

    const result = spawnSync(process.execPath, [CLI, "setup", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Override config does not exist/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp")), false);
    assert.equal(existsSync(path.join(codexHome, "agents", "visual-engineering.toml")), false);
    assert.equal(existsSync(path.join(codexHome, "config.toml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given upstream agents dir is missing when setup runs then leaves Codex home unmodified", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "missing-agents");
    const configPath = path.join(root, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "setup", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /agents_dir does not exist/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp")), false);
    assert.equal(existsSync(path.join(codexHome, "agents", "visual-engineering.toml")), false);
    assert.equal(existsSync(path.join(codexHome, "config.toml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given required upstream agent is missing when setup runs then leaves Codex home unmodified", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    mkdirSync(sourceDir);
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "setup", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing required agent TOML files/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp")), false);
    assert.equal(existsSync(path.join(codexHome, "agents", "visual-engineering.toml")), false);
    assert.equal(existsSync(path.join(codexHome, "config.toml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given CLI doctor when changes are pending then reports setup work without writing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
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

    const result = spawnSync(process.execPath, [CLI, "doctor", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });
    const unchanged = readFileSync(agentPath, "utf8");

    assert.equal(result.status, 1);
    assert.match(result.stdout, /plugin files: missing/);
    assert.match(result.stdout, /LFP agents: missing/);
    assert.match(result.stdout, /plugin config: missing/);
    assert.match(result.stdout, /agent overrides: setup would update/);
    assert.match(result.stdout, /would update .*explorer\.toml/);
    assert.match(unchanged, /model = "gpt-5\.4-mini"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given packaged role policies when doctor runs then reports packaged policy values", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "grok-4.3"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "doctor", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.match(result.stdout, /lfp doctor: role policies: packaged defaults/);
    assert.match(result.stdout, /explorer: reasoning=low, tier=fast/);
    assert.match(result.stdout, /plan: reasoning=xhigh, tier=default/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given user role policies when doctor runs then reports user override values", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    const userRolePolicyPath = path.join(codexHome, "lfp", "lfp-role-policies.toml");
    mkdirSync(sourceDir);
    mkdirSync(path.dirname(userRolePolicyPath), { recursive: true });
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "grok-4.3"\n');
    writeFileSync(userRolePolicyPath, '[policies.explorer]\nreasoning = "medium"\ntier = "default"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );
    clearRolePolicyConfigCache();

    const result = spawnSync(process.execPath, [CLI, "doctor", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.match(result.stdout, /lfp doctor: role policies: user overrides/);
    assert.match(result.stdout, /explorer: reasoning=medium, tier=default/);
    assert.match(result.stdout, /plan: reasoning=xhigh, tier=default/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given doctor sees provider inventory and model drift then reports applier visibility without leaking tokens", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-doctor-provider-"));
  const server = await startModelsServer(["glm-5.2", "grok-3-mini-fast", "gemini-pro-agent"]);
  try {
    const fixture = createDoctorProviderFixture(root, server.url);

    const result = await spawnCli(["doctor", "--config", fixture.configPath], {
      env: { ...process.env, CODEX_HOME: fixture.codexHome, HOME: root },
    });
    const unchangedAgent = readFileSync(fixture.agentPath, "utf8");

    assert.equal(result.status, 1);
    assert.match(result.stdout, /active provider id: cliproxyapi/);
    assert.match(result.stdout, /provider inventory: 3 models \(families: gemini, glm, grok\)/);
    assert.match(result.stdout, /agent model drift: explorer: model/);
    assert.match(result.stdout, /global defaults: synced \(default mode\)/);
    assert.match(result.stdout, /OMO hook state: preserved/);
    assert.doesNotMatch(result.stdout, /sk-test-secret-DO-NOT-PRINT/);
    assert.doesNotMatch(result.stdout, /Bearer sk-test-secret/);
    assert.match(unchangedAgent, /model_fallback = "old-fallback"/);
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("given setup has run when doctor runs then reports lfp installed in Codex", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "grok-4.3"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const setup = spawnSync(process.execPath, [CLI, "setup", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });
    const doctor = spawnSync(process.execPath, [CLI, "doctor", "--config", configPath], {
      env: { ...process.env, CODEX_HOME: codexHome },
      encoding: "utf8"
    });

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /plugin files: installed/);
    assert.match(doctor.stdout, /LFP agents: installed/);
    assert.match(doctor.stdout, /marketplace config: configured/);
    assert.match(doctor.stdout, /plugin config: enabled/);
    assert.match(doctor.stdout, /agent overrides: already applied/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given doctor fix-cache preview sees duplicate Codex Apps cache then reports without moving files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    const cachePath = path.join(codexHome, "cache", "codex_apps_tools", "tools.json");
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(path.dirname(cachePath), { recursive: true });
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "grok-4.3"\n');
    writeFileSync(cachePath, codexAppsToolCacheJson(["_fetch", "_fetch"]));
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "doctor", "--fix-cache", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /would quarantine duplicate Codex Apps tool cache/);
    assert.match(result.stdout, new RegExp(`${escapeRegExp(cachePath)}.*_fetch`));
    assert.equal(existsSync(cachePath), true);
    assert.equal(existsSync(path.join(path.dirname(cachePath), "quarantine")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given doctor fix-cache apply sees duplicate Codex Apps cache then quarantines and rechecks healthy", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    const cacheDir = path.join(codexHome, "cache", "codex_apps_tools");
    const cachePath = path.join(cacheDir, "tools.json");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "grok-4.3"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );
    const setup = spawnSync(process.execPath, [CLI, "setup", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, codexAppsToolCacheJson(["_fetch", "_fetch"]));

    const result = spawnSync(process.execPath, [CLI, "doctor", "--fix-cache", "--apply", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });
    const rerun = spawnSync(process.execPath, [CLI, "doctor", "--fix-cache", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`quarantined duplicate Codex Apps tool cache ${escapeRegExp(cachePath)} -> .*_fetch`));
    assert.match(result.stdout, /Codex Apps tool cache: ok/);
    assert.equal(existsSync(cachePath), false);
    assert.equal(existsSync(path.join(cacheDir, "quarantine")), true);
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.match(rerun.stdout, /Codex Apps tool cache: ok/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given doctor apply is passed without fix-cache then rejects the flag combination", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const result = spawnSync(process.execPath, [CLI, "doctor", "--apply", "--config", path.join(root, "missing.json")], {
      env: cliEnv(root),
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /doctor --apply requires --fix-cache/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given doctor apply-fix-cache is passed then rejects it as an unknown option", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const result = spawnSync(process.execPath, [CLI, "doctor", "--apply-fix-cache"], {
      env: cliEnv(root),
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown doctor option: --apply-fix-cache/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given first-run no saved user override when setup then doctor runs then reports existing override phrasing without new banners", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeOmo410AgentFixtureSet(agentsDir, { metis: { model: "custom-metis-model" } });

    const setup = spawnSync(
      process.execPath,
      [CLI, "setup", "--skip-lazycodex-install", "--config", "agent-configs/omo-agent-model-overrides.toml"],
      {
        env: { ...process.env, CODEX_HOME: codexHome },
        encoding: "utf8"
      }
    );
    const doctor = spawnSync(
      process.execPath,
      [CLI, "doctor", "--config", "agent-configs/omo-agent-model-overrides.toml"],
      {
        env: { ...process.env, CODEX_HOME: codexHome },
        encoding: "utf8"
      }
    );

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /agent overrides: already applied/);
    assert.doesNotMatch(doctor.stdout, /Adjust LFP model overrides now/i);
    assert.doesNotMatch(doctor.stdout, /using packaged defaults/i);
    assert.doesNotMatch(doctor.stdout, /user-saved overrides active/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function cliEnv(codexHome) {
  return {
    ...process.env,
    CODEX_HOME: codexHome,
    LFP_LAZYCODEX_INSTALL_BIN: process.execPath,
    LFP_LAZYCODEX_INSTALL_ARGS: JSON.stringify([LAZYCODEX_INSTALL_STUB])
  };
}

function spawnCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      ...options,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function savedOverrideJson(overrides) {
  return `${JSON.stringify({ schemaVersion: 1, overrides }, null, 2)}\n`;
}

function writeOmo410AgentFixtureSet(agentsDir, overrides = {}) {
  const agents = {
    "codex-ultrawork-reviewer": { model: "gpt-5.5", reasoning: "high", tier: "default" },
    explorer: { model: "gpt-5.4-mini", reasoning: "low", tier: "fast" },
    librarian: { model: "gpt-5.4-mini", reasoning: "low", tier: "fast" },
    metis: { model: "gpt-5.5", reasoning: "high", tier: "default" },
    momus: { model: "gpt-5.5", reasoning: "xhigh", tier: "default" },
    plan: { model: "gpt-5.5", reasoning: "xhigh", tier: "default" }
  };
  for (const [name, defaults] of Object.entries(agents)) {
    const fields = { ...defaults, ...overrides[name] };
    writeFileSync(
      path.join(agentsDir, `${name}.toml`),
      [
        `name = "${name}"`,
        `model = "${fields.model}"`,
        `model_reasoning_effort = "${fields.reasoning}"`,
        `service_tier = "${fields.tier}"`,
        ""
      ].join("\n")
    );
  }
}

function codexAppsToolCacheJson(toolNames) {
  return `${JSON.stringify({
    schema_version: 3,
    tools: toolNames.map((toolName) => ({ tool_name: toolName }))
  })}\n`;
}

function createPreservationFixture(root) {
  const codexHome = path.join(root, "codex-home");
  const agentsDir = path.join(root, "agents");
  const configPath = path.join(root, "overrides.json");
  const agentPath = path.join(agentsDir, "explorer.toml");
  const codexConfigPath = path.join(codexHome, "config.toml");
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(agentPath, 'name = "explorer"\nmodel = "gpt-5.4-mini"\ndeveloper_instructions = """keep me"""\n');
  writeFileSync(codexConfigPath, codexConfigWithDefaultsAndOmoHooks());
  writeFileSync(
    configPath,
    JSON.stringify({
      source: { agentsDir },
      overrides: {
        default: {
          model: "packaged-default",
          model_reasoning_effort: "high",
          service_tier: "default"
        },
        ulw: {
          model: "packaged-ulw",
          model_reasoning_effort: "xhigh",
          service_tier: "default"
        },
        explorer: { model: "grok-4.3" }
      }
    })
  );
  return { agentPath, codexConfigPath, codexHome, configPath };
}

function createPreservationTomlFixture(root) {
  const codexHome = path.join(root, "codex-home");
  const agentsDir = path.join(root, "agents");
  const configPath = path.join(root, "overrides.toml");
  const agentPath = path.join(agentsDir, "explorer.toml");
  const codexConfigPath = path.join(codexHome, "config.toml");
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(agentPath, 'name = "explorer"\nmodel = "gpt-5.4-mini"\ndeveloper_instructions = """keep me"""\n');
  writeFileSync(codexConfigPath, codexConfigWithDefaultsAndOmoHooks());
  writeFileSync(
    configPath,
    [
      "[source]",
      `agents_dir = "${agentsDir}"`,
      "",
      "[agents.default]",
      'model = "packaged-default"',
      'model_reasoning_effort = "high"',
      'service_tier = "default"',
      "",
      "[agents.ulw]",
      'model = "packaged-ulw"',
      'model_reasoning_effort = "xhigh"',
      'service_tier = "default"',
      "",
      "[agents.explorer]",
      'model = "grok-4.3"',
      'model_reasoning_effort = "low"',
      'service_tier = "default"',
      ""
    ].join("\n")
  );
  return { agentPath, codexConfigPath, codexHome, configPath };
}

function createBenchmarkApplyFixture(root) {
  const codexHome = path.join(root, "codex-home");
  const codexConfigPath = path.join(codexHome, "config.toml");
  const savedPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
  const outputPath = path.join(root, "benchmark-result.json");
  mkdirSync(path.dirname(savedPath), { recursive: true });
  writeFileSync(
    codexConfigPath,
    [
      'model = "hephaestus-default"',
      'model_reasoning_effort = "medium"',
      'service_tier = "flex"',
      'model_provider = "cliproxyapi"',
      "",
      "[model_providers.cliproxyapi]",
      'base_url = "https://models.example.test/v1"',
      'experimental_bearer_token = "secret"',
      ""
    ].join("\n")
  );
  writeFileSync(
    savedPath,
    savedOverrideJson({
      explorer: { model: "slow-model", model_reasoning_effort: "low", service_tier: "default" }
    })
  );
  return { codexConfigPath, codexHome, outputPath, savedPath };
}

function createDoctorProviderFixture(root, baseUrl) {
  const codexHome = path.join(root, "codex-home");
  const agentsDir = path.join(root, "agents");
  const configPath = path.join(root, "overrides.json");
  const agentPath = path.join(agentsDir, "explorer.toml");
  const codexConfigPath = path.join(codexHome, "config.toml");
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(
    agentPath,
    [
      'name = "explorer"',
      'model = "old-model"',
      'model_fallback = "old-fallback"',
      'developer_instructions = """keep me"""',
      ""
    ].join("\n")
  );
  writeFileSync(
    codexConfigPath,
    [
      'model = "hephaestus-default"',
      'model_reasoning_effort = "medium"',
      'service_tier = "flex"',
      'model_provider = "cliproxyapi"',
      "",
      "[profiles.ulw]",
      'model = "hephaestus-ulw"',
      'model_reasoning_effort = "xhigh"',
      'service_tier = "priority"',
      "",
      '[hooks."SessionStart"."omo@sisyphuslabs/sync-agent-overrides"]',
      'command = "omo sync"',
      "enabled = true",
      "",
      "[model_providers.cliproxyapi]",
      `base_url = "${baseUrl}"`,
      'experimental_bearer_token = "sk-test-secret-DO-NOT-PRINT"',
      ""
    ].join("\n")
  );
  writeFileSync(
    configPath,
    JSON.stringify({
      source: { agentsDir },
      overrides: {
        explorer: {
          model: "grok-3-mini-fast"
        }
      }
    })
  );
  return { agentPath, codexConfigPath, codexHome, configPath };
}

function startModelsServer(models) {
  const server = createServer((request, response) => {
    if (request.url === "/v1/models" || request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json", connection: "close" });
      response.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("models server did not bind to a TCP port"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/v1`,
        close: () => new Promise((closeResolve) => server.close(closeResolve))
      });
    });
  });
}

function codexConfigWithDefaultsAndOmoHooks() {
  return [
    'model = "hephaestus-default"',
    'model_reasoning_effort = "medium"',
    'service_tier = "flex"',
    "",
    "[profiles.ulw]",
    'model = "hephaestus-ulw"',
    'model_reasoning_effort = "xhigh"',
    'service_tier = "priority"',
    "",
    '[hooks."UserPromptSubmit"."omo@sisyphuslabs/visual-qa"]',
    'command = "omo visual qa"',
    "enabled = true",
    "",
    '[hooks."SessionStart"."omo@sisyphuslabs/sync-agent-overrides"]',
    'command = "omo sync"',
    "enabled = true",
    "",
    '[hook_state."omo@sisyphuslabs/session-start"]',
    'last_status = "ok"',
    'updated_at = "2026-06-15T00:00:00Z"',
    ""
  ].join("\n");
}

function assertCodexDefaultsPreserved(configText) {
  assert.match(configText, /^model = "hephaestus-default"$/m);
  assert.match(configText, /^model_reasoning_effort = "medium"$/m);
  assert.match(configText, /^service_tier = "flex"$/m);
  assert.match(
    configText,
    /\[profiles\.ulw]\nmodel = "hephaestus-ulw"\nmodel_reasoning_effort = "xhigh"\nservice_tier = "priority"/
  );
  assert.doesNotMatch(configText, /packaged-default|packaged-ulw/);
}

function assertCodexDefaultsSynced(configText) {
  assert.match(configText, /^model = "packaged-default"$/m);
  assert.match(configText, /^model_reasoning_effort = "high"$/m);
  assert.match(configText, /^service_tier = "default"$/m);
  assert.match(
    configText,
    /\[profiles\.ulw]\nmodel = "packaged-ulw"\nmodel_reasoning_effort = "xhigh"\nservice_tier = "default"/
  );
}

function hookStateHash(configText) {
  const hookLines = [];
  let inHookSection = false;
  for (const line of configText.split(/\r?\n/)) {
    if (line.startsWith("[")) inHookSection = line.startsWith("[hooks.") || line.startsWith("[hook_state.");
    if (inHookSection) hookLines.push(line);
  }
  return sha256(hookLines.join("\n"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
