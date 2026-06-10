import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { configureAgentModelOverrides, getUserOverrideConfigPath } from "../scripts/agent-model-config.mjs";
import { getLegacyUserOverrideConfigPath } from "../scripts/user-model-overrides.mjs";

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
    assert.equal(savedPath, path.join(codexHome, ".ledger", "lfp", "omo-agent-model-overrides.toml"));
    const savedText = readFileSync(savedPath, "utf8");
    assert.match(savedText, /model = "gpt-5\.4-mini"/);
    assert.match(savedText, /model_reasoning_effort = "xhigh"/);
    assert.doesNotMatch(savedText, /\[source]/);

    writeFileSync(savedPath, overrideText(root, "gpt-5.4-mini", "xhigh", "fast"));
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
    const savedPath = path.join(codexHome, ".ledger", "lfp", "omo-agent-model-overrides.toml");
    writeFileSync(configPath, overrideText("${CODEX_HOME}/agents", "grok-4.3", "low", "default"));
    mkdirSync(path.dirname(savedPath), { recursive: true });
    writeFileSync(savedPath, overrideText("${CODEX_HOME}/agents", "gpt-5.4-mini", "xhigh", "fast"));

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

test("given legacy saved user override exists when configuring then migrates it into Codex ledger", async () => {
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
    assert.match(readFileSync(savedPath, "utf8"), /model = "grok-4\.3"/);
    assert.ok(output.questions.some((question) => question.includes(path.join(codexHome, ".ledger", "lfp"))));
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
    // deliberately no ledger file under codexHome/.ledger/lfp

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
