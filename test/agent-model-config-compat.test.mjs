import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { configureAgentModelOverrides } from "../scripts/agent-model-config.mjs";

test("given glm model with xhigh reasoning when configuring setup then writes compatible high reasoning", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-models-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
        "",
        "[agents.metis]",
        'model = "glm-5.2"',
        'model_reasoning_effort = "xhigh"',
        'service_tier = "default"',
        ""
      ].join("\n")
    );

    const config = await configureAgentModelOverrides(configPath, {
      models: ["glm-5.2"],
      readline: fakeReadline(["", "", ""]),
      output: silentOutput(),
      confirmConfiguredValues: true,
      persistUserOverrides: false
    });
    const updated = readFileSync(configPath, "utf8");

    assert.equal(config.overrides.metis.model, "glm-5.2");
    assert.equal(config.overrides.metis.model_reasoning_effort, "high");
    assert.match(updated, /\[agents\.metis]\nmodel = "glm-5\.2"\nmodel_reasoning_effort = "high"\nservice_tier = "default"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function fakeReadline(answers) {
  return {
    question(_question, resolve) {
      resolve(answers.shift() ?? "");
    }
  };
}

function silentOutput() {
  return { log() {} };
}
