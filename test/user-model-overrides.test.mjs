import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { configureAgentModelOverrides, getUserOverrideConfigPath } from "../scripts/agent-model-config.mjs";
import { escapeRegExp } from "../scripts/toml-string-utils.mjs";
import { getLegacyUserOverrideConfigPath, restoreAgentModelApplication } from "../scripts/user-model-overrides.mjs";

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
    assert.equal(savedPath, path.join(codexHome, "lfp", "omo-agent-model-overrides.json"));
    const savedJson = JSON.parse(readFileSync(savedPath, "utf8"));
    assert.equal(savedJson.schemaVersion, 1);
    assert.equal(savedJson.overrides.explorer.model, "gpt-5.4-mini");
    assert.equal(savedJson.overrides.explorer.model_reasoning_effort, "xhigh");
    assert.equal(savedJson.source, undefined);

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
    assert.equal(restored.overrides.explorer.service_tier, "default");
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
    const savedPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
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

test("given saved user override includes fallback fields when user declines adjust then restores fallback fields", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "overrides.toml");
    const savedPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
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
    const savedPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
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
      /"overrides",\s*"explorer",\s*"model_reasoning_effort"/
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
    assert.ok(output.questions.some((question) => question.includes(path.join(codexHome, "lfp"))));
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

test("given previous saved override config when restoring agent model application then saved config and installed TOML return to previous fields", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-rollback-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    const configPath = path.join(root, "overrides.toml");
    const previousPath = path.join(root, "previous-overrides.json");
    const currentSavedPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
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
    writeFileSync(currentSavedPath, savedOverrideJsonWithAllFields("new-primary", "high", "fast", "new-fallback", "medium", "fast"));
    writeFileSync(previousPath, savedOverrideJsonWithAllFields("previous-primary", "low", "default", "previous-fallback", "low", "default"));

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
    assert.match(agentText, /service_tier = "default"/);
    assert.doesNotMatch(agentText, /^model_fallback/m);
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
    const currentSavedPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(path.dirname(currentSavedPath), { recursive: true });
    const currentAgentText = [
      'name = "explorer"',
      'model = "current-primary"',
      'model_fallback = "current-fallback"',
      ""
    ].join("\n");
    const currentSavedText = savedOverrideJsonWithAllFields("current-primary", "low", "default", "current-fallback", "low", "default");
    writeFileSync(path.join(agentsDir, "explorer.toml"), currentAgentText);
    writeFileSync(configPath, ["[source]", 'agents_dir = "${CODEX_HOME}/agents"', "", "[agents.explorer]", 'model = "current-primary"', ""].join("\n"));
    writeFileSync(currentSavedPath, currentSavedText);
    writeFileSync(previousPath, '{"schemaVersion":1,"overrides":{"explorer":{"model":123}}}');

    assert.throws(
      () => restoreAgentModelApplication(configPath, previousPath, { env: { ...process.env, CODEX_HOME: codexHome } }),
      /Invalid|Expected string|received number/i
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
  return `${JSON.stringify({
    schemaVersion: 1,
    overrides: {
      explorer: {
        model,
        model_reasoning_effort: reasoning,
        service_tier: tier
      }
    }
  }, null, 2)}\n`;
}

function savedOverrideJsonWithFallback() {
  return `${JSON.stringify({
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
  }, null, 2)}\n`;
}

function savedOverrideJsonWithAllFields(model, reasoning, tier, fallback, fallbackReasoning, fallbackTier) {
  return `${JSON.stringify({
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
  }, null, 2)}\n`;
}
