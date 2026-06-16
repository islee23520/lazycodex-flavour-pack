import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { configureArtTeam } from "../scripts/art-team-config.mjs";

test("given art team setup when user selects listed models tiers and reasoning then writes selections", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-art-config-"));
  try {
    writeArtAgentConfigs(root);

    const config = await configureArtTeam({
      configDir: root,
      models: ["gpt-5.5", "gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["3", "2", "4", "1", "1", "2", "2", "2", "3"]),
      output: silentOutput()
    });
    const director = readFileSync(path.join(root, "artistry.toml"), "utf8");
    const worker = readFileSync(path.join(root, "artistry-gen.toml"), "utf8");
    const qa = readFileSync(path.join(root, "artistry-qa.toml"), "utf8");

    assert.equal(config.artistry.model, "grok-4.3");
    assert.equal(config.artistry.service_tier, "fast");
    assert.equal(config.artistry.model_reasoning_effort, "xhigh");
    assert.equal(config["artistry-gen"].model_reasoning_effort, "medium");
    assert.equal(config["artistry-qa"].model_reasoning_effort, "high");
    assert.match(director, /model = "grok-4\.3"/);
    assert.match(director, /model_reasoning_effort = "xhigh"/);
    assert.match(director, /service_tier = "fast"/);
    assert.match(worker, /model = "gpt-5\.5"/);
    assert.match(worker, /model_reasoning_effort = "medium"/);
    assert.match(worker, /service_tier = "default"/);
    assert.match(qa, /model = "gpt-5\.4-mini"/);
    assert.match(qa, /model_reasoning_effort = "high"/);
    assert.match(qa, /service_tier = "fast"/);
    assert.ok(configOutput.questions.some((question) => /artistry \(Art Director \(supervisor\)\) model/.test(question)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeArtAgentConfigs(root) {
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, "artistry.toml"), artAgentText("artistry", "gemini-pro-agent", "default"));
  writeFileSync(path.join(root, "artistry-gen.toml"), artAgentText("artistry-gen", "gemini-pro-agent", "default"));
  writeFileSync(path.join(root, "artistry-qa.toml"), artAgentText("artistry-qa", "gemini-pro-agent", "default"));
}

function artAgentText(name, model, tier) {
  return [`name = "${name}"`, `model = "${model}"`, 'model_reasoning_effort = "high"', `service_tier = "${tier}"`, ""].join("\n");
}

function fakeReadline(answers) {
  return {
    question(question, resolve) {
      configOutput.questions.push(question);
      resolve(answers.shift() ?? "");
    }
  };
}

let configOutput = { questions: [] };

function silentOutput() {
  configOutput = { questions: [] };
  return { log() {} };
}
