import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { configureAgentModelOverrides, getUserOverrideConfigPath } from "../src/model/agent-model-config.ts";
import { readOverrideConfig } from "../src/model/model-override-config.ts";
import { SavedUserModelOverrideConfigSchema } from "../src/model/model-override-schema.ts";
import {
  getLegacyUserOverrideConfigPath,
  migrateLegacyUserOverrideConfig,
  restoreAgentModelApplication,
  saveUserOverrideConfig
} from "../src/model/user-model-overrides.ts";
import { escapeRegExp } from "../src/utils/toml-string-utils.ts";

test("given CODEX_HOME when resolving saved user override path then returns lfp json at codex root", () => {
  const codexHome = path.join("tmp", "codex-home");
  assert.equal(getUserOverrideConfigPath({ env: { CODEX_HOME: codexHome } }), path.join(codexHome, "lfp.json"));
});

test("given valid v2 saved override config when parsing schema then accepts source overrides and role policies", () => {
  const parsed = SavedUserModelOverrideConfigSchema.parse({
    schemaVersion: 2,
    source: { agentsDir: "${CODEX_HOME}/agents" },
    overrides: {
      explorer: { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "fast" }
    },
    rolePolicies: {
      explorer: { reasoning: "high", tier: "default" }
    }
  });

  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.source.agentsDir, "${CODEX_HOME}/agents");
  assert.equal(parsed.rolePolicies.explorer.reasoning, "high");
});

test("given v2 saved override config has unknown top-level field when parsing then rejects strict schema", () => {
  assert.throws(
    () =>
      SavedUserModelOverrideConfigSchema.parse({
        schemaVersion: 2,
        overrides: {},
        rolePolicies: {},
        unknown: true
      }),
    /Unrecognized key|unrecognized_keys|Unknown/i
  );
});

test("given v1 saved override config when read as override config then migrates to v2 shape with defaults", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-v1-migration-"));
  try {
    const configPath = path.join(root, "legacy.json");
    writeFileSync(configPath, savedOverrideJson("gpt-5.5", "high", "default"));

    const config = readOverrideConfig(configPath, { env: { CODEX_HOME: path.join(root, "codex-home") } });

    assert.equal(config.source.agentsDir, path.join(root, "codex-home", "agents"));
    assert.deepEqual(config.rolePolicies, {});
    assert.equal(config.overrides.explorer.model, "gpt-5.5");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given legacy v1 saved config with multiple agents when migrating then preserves every override entry", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-v1-preserve-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const legacyPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
    mkdirSync(path.dirname(legacyPath), { recursive: true });
    writeFileSync(
      legacyPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          overrides: {
            explorer: { model: "gpt-5.5" },
            plan: { model: "grok-4", model_fallback: "gpt-5.4-mini" }
          }
        },
        null,
        2
      )}\n`
    );

    const savedPath = migrateLegacyUserOverrideConfig({ env: { CODEX_HOME: codexHome } });
    const savedJson = JSON.parse(readFileSync(savedPath, "utf8"));

    assert.equal(savedJson.schemaVersion, 2);
    assert.deepEqual(Object.keys(savedJson.overrides).sort(), ["explorer", "plan"]);
    assert.equal(savedJson.overrides.plan.model_fallback, "gpt-5.4-mini");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given lfp json already exists when migrating then does not overwrite from legacy config", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-idempotent-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const savedPath = path.join(codexHome, "lfp.json");
    const legacyPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
    mkdirSync(path.dirname(savedPath), { recursive: true });
    mkdirSync(path.dirname(legacyPath), { recursive: true });
    writeFileSync(savedPath, savedOverrideJsonV2("canonical-model", "high", "fast"));
    writeFileSync(legacyPath, savedOverrideJson("legacy-model", "low", "default"));

    assert.equal(migrateLegacyUserOverrideConfig({ env: { CODEX_HOME: codexHome } }), savedPath);
    const savedJson = JSON.parse(readFileSync(savedPath, "utf8"));

    assert.equal(savedJson.overrides.explorer.model, "canonical-model");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given old JSON saved override path exists when migrating then writes v2 lfp json", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-old-json-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const legacyPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
    mkdirSync(path.dirname(legacyPath), { recursive: true });
    writeFileSync(legacyPath, savedOverrideJson("gpt-5.5", "xhigh", "fast"));

    const savedPath = migrateLegacyUserOverrideConfig({ env: { CODEX_HOME: codexHome } });
    const savedJson = JSON.parse(readFileSync(savedPath, "utf8"));

    assert.equal(savedPath, path.join(codexHome, "lfp.json"));
    assert.equal(savedJson.schemaVersion, 2);
    assert.equal(savedJson.overrides.explorer.model, "gpt-5.5");
    assert.equal(readFileSync(legacyPath, "utf8"), savedOverrideJson("gpt-5.5", "xhigh", "fast"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given TOML override config when saving user config then writes schema version 2", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-save-v2-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    const savedPath = path.join(root, "codex-home", "lfp.json");
    writeFileSync(configPath, overrideText("${CODEX_HOME}/agents", "gpt-5.5", "high", "default"));

    saveUserOverrideConfig(configPath, savedPath);
    const savedJson = JSON.parse(readFileSync(savedPath, "utf8"));

    assert.equal(savedJson.schemaVersion, 2);
    assert.equal(savedJson.source.agentsDir, "${CODEX_HOME}/agents");
    assert.deepEqual(savedJson.rolePolicies, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given saved user override config when setup runs again then restores model fields without stale agents dir", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(configPath, overrideText("${CODEX_HOME}/agents", "grok-4.3", "low", "default"));

    await configureAgentModelOverrides(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome },
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["1", "2", "4"]),
      output: silentOutput()
    });
    const savedPath = getUserOverrideConfigPath({ env: { CODEX_HOME: codexHome } });
    assert.equal(savedPath, path.join(codexHome, "lfp.json"));
    const savedJson = JSON.parse(readFileSync(savedPath, "utf8"));
    assert.equal(savedJson.schemaVersion, 2);
    assert.equal(savedJson.overrides.explorer.model, "gpt-5.4-mini");
    assert.equal(savedJson.overrides.explorer.model_reasoning_effort, "xhigh");
    assert.equal(savedJson.source.agentsDir, "${CODEX_HOME}/agents");

    writeFileSync(savedPath, savedOverrideJson("gpt-5.4-mini", "xhigh", "fast"));
    writeFileSync(configPath, overrideText("${CODEX_HOME}/agents", "grok-4.3", "low", "default"));
    const output = captureOutput();
    const restored = await configureAgentModelOverrides(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome },
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["y", "2", "1", "2"]),
      output
    });

    assert.equal(restored.overrides.explorer.model, "grok-4.3");
    assert.equal(restored.overrides.explorer.model_reasoning_effort, "medium");
    assert.equal(restored.overrides.explorer.service_tier, undefined);
    const restoredText = readFileSync(configPath, "utf8");
    assert.match(restoredText, /agents_dir = "\$\{CODEX_HOME}\/agents"/);
    assert.match(restoredText, /model = "grok-4\.3"/);
    assert.match(restoredText, /model_reasoning_effort = "medium"/);
    assert.doesNotMatch(restoredText, new RegExp(escapeRegExp(root)));
    assert.ok(output.questions.some((question) => /Adjust LFP model overrides now/.test(question)));
    assert.ok(output.questions.some((question) => /explorer model/.test(question)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given saved user override when user declines adjust then keeps saved settings without model prompts", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "overrides.toml");
    const savedPath = path.join(codexHome, "lfp.json");
    writeFileSync(configPath, overrideText("${CODEX_HOME}/agents", "grok-4.3", "low", "default"));
    mkdirSync(path.dirname(savedPath), { recursive: true });
    writeFileSync(savedPath, savedOverrideJson("gpt-5.4-mini", "xhigh", "fast"));

    const output = captureOutput();
    const result = await configureAgentModelOverrides(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome },
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["n"]),
      output
    });

    assert.equal(result.overrides.explorer.model, "gpt-5.4-mini");
    assert.equal(result.overrides.explorer.model_reasoning_effort, "xhigh");
    assert.ok(output.questions.some((question) => /Adjust LFP model overrides now/.test(question)));
    assert.ok(!output.questions.some((question) => /explorer model/.test(question)));
    assert.match(readFileSync(configPath, "utf8"), /model = "gpt-5\.4-mini"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given saved user override includes removed LFP agents when setup adjusts then prunes them and does not prompt", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "overrides.toml");
    const savedPath = path.join(codexHome, "lfp.json");
    writeFileSync(configPath, overrideText("${CODEX_HOME}/agents", "grok-4.3", "low", "default"));
    mkdirSync(path.dirname(savedPath), { recursive: true });
    writeFileSync(
      savedPath,
      `${JSON.stringify(
        {
          schemaVersion: 2,
          source: { agentsDir: "${CODEX_HOME}/agents" },
          overrides: {
            explorer: {
              model: "gpt-5.4-mini",
              model_reasoning_effort: "low",
              service_tier: "default"
            },
            sisyphus: { model: "gpt-5.5" },
            "visual-engineering": { model: "gemini-2.5" }
          },
          rolePolicies: {}
        },
        null,
        2
      )}\n`
    );
    const output = captureOutput();

    const result = await configureAgentModelOverrides(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome },
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["y", "1", "1", "1"]),
      output
    });
    const savedJson = JSON.parse(readFileSync(savedPath, "utf8"));
    const restoredText = readFileSync(configPath, "utf8");

    assert.equal(result.overrides["visual-engineering"], undefined);
    assert.equal(result.overrides.sisyphus, undefined);
    assert.equal(savedJson.overrides["visual-engineering"], undefined);
    assert.equal(savedJson.overrides.sisyphus, undefined);
    assert.doesNotMatch(restoredText, /visual-engineering|sisyphus/);
    assert.ok(!output.questions.some((question) => /visual-engineering|sisyphus/.test(question)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given saved user override includes fallback fields when user declines adjust then restores fallback fields", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "overrides.toml");
    const savedPath = path.join(codexHome, "lfp.json");
    writeFileSync(configPath, overrideText("${CODEX_HOME}/agents", "grok-4.3", "low", "default"));
    mkdirSync(path.dirname(savedPath), { recursive: true });
    writeFileSync(savedPath, savedOverrideJsonWithFallback());

    const result = await configureAgentModelOverrides(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome },
      models: ["gpt-5.5", "grok-4.20-0309-reasoning"],
      readline: fakeReadline(["n"]),
      output: captureOutput()
    });
    const restoredText = readFileSync(configPath, "utf8");

    assert.equal(result.overrides.plan.model, "gpt-5.5");
    assert.equal(result.overrides.plan.model_fallback, "grok-4.20-0309-reasoning");
    assert.match(restoredText, /model_fallback = "grok-4\.20-0309-reasoning"/);
    assert.match(restoredText, /model_fallback_reasoning_effort = "high"/);
    assert.match(restoredText, /model_fallback_service_tier = "default"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given saved user override has unsupported max reasoning when configuring then reports validation error", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "overrides.toml");
    const savedPath = path.join(codexHome, "lfp.json");
    writeFileSync(configPath, overrideText("${CODEX_HOME}/agents", "grok-4.3", "low", "default"));
    mkdirSync(path.dirname(savedPath), { recursive: true });
    writeFileSync(savedPath, savedOverrideJson("gpt-5.4-mini", "max", "default"));

    await assert.rejects(
      configureAgentModelOverrides(configPath, {
        env: { ...process.env, CODEX_HOME: codexHome },
        models: ["gpt-5.4-mini", "grok-4.3"],
        readline: fakeReadline(["n"]),
        output: silentOutput()
      }),
      /overrides\.explorer\.model_reasoning_effort/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given legacy ledger saved user override exists when configuring then migrates it into Codex LFP config", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "overrides.toml");
    const legacyPath = getLegacyUserOverrideConfigPath({ env: { CODEX_HOME: codexHome } });
    writeFileSync(configPath, overrideText("${CODEX_HOME}/agents", "grok-4.3", "low", "default"));
    mkdirSync(path.dirname(legacyPath), { recursive: true });
    writeFileSync(legacyPath, overrideText(root, "gpt-5.4-mini", "xhigh", "fast"));

    const output = captureOutput();
    await configureAgentModelOverrides(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome },
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["y", "2", "1", "2"]),
      output
    });

    const savedPath = getUserOverrideConfigPath({ env: { CODEX_HOME: codexHome } });
    const savedJson = JSON.parse(readFileSync(savedPath, "utf8"));
    assert.equal(savedJson.overrides.explorer.model, "grok-4.3");
    assert.ok(output.questions.some((question) => question.includes(path.join(codexHome, "lfp.json"))));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given legacy LFP TOML saved user override exists when configuring then migrates it into JSON config", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "overrides.toml");
    const legacyPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.toml");
    writeFileSync(configPath, overrideText("${CODEX_HOME}/agents", "grok-4.3", "low", "default"));
    mkdirSync(path.dirname(legacyPath), { recursive: true });
    writeFileSync(legacyPath, overrideText(root, "gpt-5.4-mini", "xhigh", "fast"));

    await configureAgentModelOverrides(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome },
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["n"]),
      output: silentOutput()
    });

    const savedPath = getUserOverrideConfigPath({ env: { CODEX_HOME: codexHome } });
    const savedJson = JSON.parse(readFileSync(savedPath, "utf8"));
    assert.equal(savedJson.overrides.explorer.model, "gpt-5.4-mini");
    assert.equal(savedJson.overrides.explorer.service_tier, "fast");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given previous upstream saved override config when restoring agent model application then saved config returns and installed TOML is updated", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-rollback-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    const configPath = path.join(root, "overrides.toml");
    const previousPath = path.join(root, "previous-overrides.json");
    const currentSavedPath = path.join(codexHome, "lfp.json");
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(path.dirname(currentSavedPath), { recursive: true });
    writeFileSync(
      path.join(agentsDir, "explorer.toml"),
      [
        'name = "explorer"',
        'model = "new-primary"',
        'model_reasoning_effort = "high"',
        'service_tier = "fast"',
        'model_fallback = "new-fallback"',
        'model_fallback_reasoning_effort = "medium"',
        'model_fallback_service_tier = "fast"',
        ""
      ].join("\n")
    );
    writeFileSync(
      configPath,
      [
        "[source]",
        'agents_dir = "${CODEX_HOME}/agents"',
        "",
        "[agents.explorer]",
        'model = "new-primary"',
        'model_reasoning_effort = "high"',
        'service_tier = "fast"',
        'model_fallback = "new-fallback"',
        'model_fallback_reasoning_effort = "medium"',
        'model_fallback_service_tier = "fast"',
        ""
      ].join("\n")
    );
    writeFileSync(
      currentSavedPath,
      savedOverrideJsonWithAllFields("new-primary", "high", "fast", "new-fallback", "medium", "fast")
    );
    writeFileSync(
      previousPath,
      savedOverrideJsonWithAllFields("previous-primary", "low", "default", "previous-fallback", "low", "default")
    );

    const result = restoreAgentModelApplication(configPath, previousPath, {
      env: { ...process.env, CODEX_HOME: codexHome }
    });
    const agentText = readFileSync(path.join(agentsDir, "explorer.toml"), "utf8");
    const savedJson = JSON.parse(readFileSync(currentSavedPath, "utf8"));

    assert.deepEqual(result.changed, [path.join(agentsDir, "explorer.toml")]);
    assert.equal(result.savedConfigPath, currentSavedPath);
    assert.equal(savedJson.overrides.explorer.model, "previous-primary");
    assert.equal(savedJson.overrides.explorer.model_fallback, "previous-fallback");
    assert.match(agentText, /model = "previous-primary"/);
    assert.match(agentText, /model_reasoning_effort = "low"/);
    assert.doesNotMatch(agentText, /^service_tier = /m);
    assert.match(agentText, /^model_fallback = "new-fallback"$/m);
    assert.match(agentText, /^model_fallback_reasoning_effort = "medium"$/m);
    assert.match(agentText, /^model_fallback_service_tier = "fast"$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given malformed previous saved override config when restoring then leaves current saved config and installed TOML unchanged", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-rollback-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    const configPath = path.join(root, "overrides.toml");
    const previousPath = path.join(root, "previous-overrides.json");
    const currentSavedPath = path.join(codexHome, "lfp.json");
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(path.dirname(currentSavedPath), { recursive: true });
    const currentAgentText = [
      'name = "explorer"',
      'model = "current-primary"',
      'model_fallback = "current-fallback"',
      ""
    ].join("\n");
    const currentSavedText = savedOverrideJsonWithAllFields(
      "current-primary",
      "low",
      "default",
      "current-fallback",
      "low",
      "default"
    );
    writeFileSync(path.join(agentsDir, "explorer.toml"), currentAgentText);
    writeFileSync(
      configPath,
      [
        "[source]",
        'agents_dir = "${CODEX_HOME}/agents"',
        "",
        "[agents.explorer]",
        'model = "current-primary"',
        ""
      ].join("\n")
    );
    writeFileSync(currentSavedPath, currentSavedText);
    writeFileSync(previousPath, '{"schemaVersion":1,"overrides":{"explorer":{"model":123}}}');

    assert.throws(
      () => restoreAgentModelApplication(configPath, previousPath, { env: { ...process.env, CODEX_HOME: codexHome } }),
      /Invalid|Expected string|received number|expected a non-empty string/i
    );
    assert.equal(readFileSync(path.join(agentsDir, "explorer.toml"), "utf8"), currentAgentText);
    assert.equal(readFileSync(currentSavedPath, "utf8"), currentSavedText);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given no saved user override when configureAgentModelOverrides runs then emits no Adjust prompt", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(configPath, overrideText("${CODEX_HOME}/agents", "grok-4.3", "low", "default"));
    // deliberately no saved override file under codexHome/lfp

    const output = captureOutput();
    await configureAgentModelOverrides(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome },
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["1", "2", "4"]),
      output
    });

    assert.ok(!output.questions.some((question) => /Adjust LFP model overrides now/.test(question)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function fakeReadline(answers) {
  return {
    question(question, resolve) {
      currentOutput?.questions.push(question);
      resolve(answers.shift() ?? "");
    }
  };
}

function silentOutput() {
  return { log() {} };
}

let currentOutput = null;

function captureOutput() {
  currentOutput = { questions: [] };
  return { log() {}, questions: currentOutput.questions };
}

function overrideText(root, model, reasoning, tier) {
  return [
    "[source]",
    `agents_dir = "${root}"`,
    "",
    "[agents.explorer]",
    `model = "${model}"`,
    `model_reasoning_effort = "${reasoning}"`,
    `service_tier = "${tier}"`,
    ""
  ].join("\n");
}

function savedOverrideJson(model, reasoning, tier) {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      overrides: {
        explorer: {
          model,
          model_reasoning_effort: reasoning,
          service_tier: tier
        }
      }
    },
    null,
    2
  )}\n`;
}

function savedOverrideJsonV2(model, reasoning, tier) {
  return `${JSON.stringify(
    {
      schemaVersion: 2,
      source: { agentsDir: "${CODEX_HOME}/agents" },
      overrides: {
        explorer: {
          model,
          model_reasoning_effort: reasoning,
          service_tier: tier
        }
      },
      rolePolicies: {}
    },
    null,
    2
  )}\n`;
}

function savedOverrideJsonWithFallback() {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      overrides: {
        plan: {
          model: "gpt-5.5",
          model_reasoning_effort: "xhigh",
          service_tier: "default",
          model_fallback: "grok-4.20-0309-reasoning",
          model_fallback_reasoning_effort: "high",
          model_fallback_service_tier: "default"
        }
      }
    },
    null,
    2
  )}\n`;
}

function savedOverrideJsonWithAllFields(model, reasoning, tier, fallback, fallbackReasoning, fallbackTier) {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      overrides: {
        explorer: {
          model,
          model_reasoning_effort: reasoning,
          service_tier: tier,
          model_fallback: fallback,
          model_fallback_reasoning_effort: fallbackReasoning,
          model_fallback_service_tier: fallbackTier
        }
      }
    },
    null,
    2
  )}\n`;
}
