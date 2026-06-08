import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { configureArtTeam, configureArtTeamIfWanted } from "../scripts/art-team-config.mjs";

test("given art team setup when user selects listed models tiers and reasoning then writes selections", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-art-config-"));
  try {
    writeArtAgentConfigs(root);

    const config = await configureArtTeam({
      configDir: root,
      models: ["gpt-5.5", "glm-5v-turbo", "grok-4.3"],
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
    assert.match(qa, /model = "glm-5v-turbo"/);
    assert.match(qa, /model_reasoning_effort = "high"/);
    assert.match(qa, /service_tier = "fast"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given setup asks about art team when user declines then leaves art configs unchanged", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-art-config-"));
  try {
    writeArtAgentConfigs(root);
    const before = readFileSync(path.join(root, "artistry.toml"), "utf8");

    const result = await configureArtTeamIfWanted({
      configDir: root,
      models: ["gpt-5.5", "glm-5v-turbo"],
      readline: fakeReadline(["n"]),
      output: silentOutput()
    });

    assert.equal(result, null);
    assert.equal(readFileSync(path.join(root, "artistry.toml"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeArtAgentConfigs(root) {
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, "artistry.toml"), artAgentText("artistry", "gpt-5.5", "default"));
  writeFileSync(path.join(root, "artistry-gen.toml"), artAgentText("artistry-gen", "glm-5v-turbo", "fast"));
  writeFileSync(path.join(root, "artistry-qa.toml"), artAgentText("artistry-qa", "grok-4.3", "default"));
}

function artAgentText(name, model, tier) {
  return [`name = "${name}"`, `model = "${model}"`, 'model_reasoning_effort = "high"', `service_tier = "${tier}"`, ""].join("\n");
}

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
