import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { configureAgentModelOverrides, getUserOverrideConfigPath } from "../scripts/agent-model-config.mjs";

test("given saved user override config when setup runs again then can restore it before prompting for models", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-user-models-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(configPath, overrideText(root, "grok-4.3", "low", "default"));

    await configureAgentModelOverrides(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome },
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["1", "2", "4"]),
      output: silentOutput()
    });
    const savedPath = getUserOverrideConfigPath({ env: { CODEX_HOME: codexHome } });
    assert.match(readFileSync(savedPath, "utf8"), /model = "gpt-5\.4-mini"/);
    assert.match(readFileSync(savedPath, "utf8"), /model_reasoning_effort = "xhigh"/);

    writeFileSync(configPath, overrideText(root, "grok-4.3", "low", "default"));
    const output = captureOutput();
    const restored = await configureAgentModelOverrides(configPath, {
      env: { ...process.env, CODEX_HOME: codexHome },
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["y"]),
      output
    });

    assert.equal(restored.overrides.explorer.model, "gpt-5.4-mini");
    assert.equal(restored.overrides.explorer.model_reasoning_effort, "xhigh");
    assert.match(readFileSync(configPath, "utf8"), /model = "gpt-5\.4-mini"/);
    assert.ok(output.questions.some((question) => /Apply saved LFP model override config/.test(question)));
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
