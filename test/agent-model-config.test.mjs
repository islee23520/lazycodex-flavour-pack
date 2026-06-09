import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  configureAgentModelOverrides,
  fetchAvailableModels,
  normalizeModelsPayload,
  readActiveModelProvider
} from "../scripts/agent-model-config.mjs";

test("given Codex provider config when reading active model provider then returns model endpoint settings", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-models-"));
  try {
    const configPath = path.join(root, "config.toml");
    writeFileSync(
      configPath,
      [
        'model_provider = "cliproxyapi"',
        "",
        "[model_providers.cliproxyapi]",
        'base_url = "https://models.example.test/v1"',
        'experimental_bearer_token = "secret-token"',
        ""
      ].join("\n")
    );

    const provider = readActiveModelProvider({ codexConfigPath: configPath });

    assert.deepEqual(provider, {
      id: "cliproxyapi",
      baseUrl: "https://models.example.test/v1",
      bearerToken: "secret-token",
      bearerTokenEnv: null
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given provider models endpoint when fetching available models then returns sorted unique model ids", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-models-"));
  try {
    const configPath = path.join(root, "config.toml");
    writeFileSync(
      configPath,
      [
        'model_provider = "cliproxyapi"',
        "",
        "[model_providers.cliproxyapi]",
        'base_url = "https://models.example.test/v1"',
        'experimental_bearer_token = "secret-token"',
        ""
      ].join("\n")
    );

    const models = await fetchAvailableModels({
      codexConfigPath: configPath,
      fetch: async (url, request) => {
        assert.equal(String(url), "https://models.example.test/v1/models");
        assert.equal(request.headers.authorization, "Bearer secret-token");
        return {
          ok: true,
          async json() {
            return { data: [{ id: "gpt-5.4-mini" }, { id: "grok-4.3" }, { id: "gpt-5.4-mini" }] };
          }
        };
      }
    });

    assert.deepEqual(models, ["gpt-5.4-mini", "grok-4.3"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given interactive OMO override setup when user selects listed model tier and reasoning then writes all to TOML", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-models-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
        "",
        "[agents.explorer]",
        'model = "grok-4.3"',
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

    const config = await configureAgentModelOverrides(configPath, {
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["1", "2", "4", "2", "1", "1"]),
      output: silentOutput(),
      persistUserOverrides: false
    });
    const updated = readFileSync(configPath, "utf8");

    assert.equal(config.overrides.explorer.model, "gpt-5.4-mini");
    assert.equal(config.overrides.explorer.service_tier, "fast");
    assert.equal(config.overrides.explorer.model_reasoning_effort, "xhigh");
    assert.equal(config.overrides.librarian.model, "grok-4.3");
    assert.equal(config.overrides.librarian.service_tier, "default");
    assert.equal(config.overrides.librarian.model_reasoning_effort, "low");
    assert.match(updated, /model = "gpt-5\.4-mini"/);
    assert.match(updated, /service_tier = "fast"/);
    assert.match(updated, /model_reasoning_effort = "xhigh"/);
    assert.match(updated, /\[agents\.librarian]\nmodel = "grok-4\.3"\nmodel_reasoning_effort = "low"\nservice_tier = "default"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given additional installed OMO agent when user opts in then appends override section", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-models-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(path.join(root, "metis.toml"), agentText("metis", "gpt-5.5", "fast"));
    writeFileSync(path.join(root, "artistry.toml"), agentText("artistry", "gpt-5.5", "default"));
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
        "",
        "[agents.explorer]",
        'model = "grok-4.3"',
        'model_reasoning_effort = "low"',
        'service_tier = "default"',
        ""
      ].join("\n")
    );

    const config = await configureAgentModelOverrides(configPath, {
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["", "", "", "y", "1", "2", "3"]),
      output: captureOutput(),
      persistUserOverrides: false
    });
    const updated = readFileSync(configPath, "utf8");

    assert.equal(config.overrides.metis.model, "gpt-5.4-mini");
    assert.equal(config.overrides.metis.service_tier, "fast");
    assert.equal(config.overrides.metis.model_reasoning_effort, "high");
    assert.match(updated, /\[agents\.metis]\nmodel = "gpt-5\.4-mini"\nmodel_reasoning_effort = "high"\nservice_tier = "fast"/);
    assert.ok(configOutput.questions.some((question) => /metis \(current: gpt-5\.5\)/.test(question)));
    assert.doesNotMatch(updated, /\[agents\.artistry]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given additional installed OMO agent when user declines then does not append override section", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-models-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(path.join(root, "momus.toml"), agentText("momus", "gpt-5.5", "fast"));
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
        "",
        "[agents.explorer]",
        'model = "grok-4.3"',
        'service_tier = "default"',
        ""
      ].join("\n")
    );

    const config = await configureAgentModelOverrides(configPath, {
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["", "", "", "n"]),
      output: silentOutput(),
      persistUserOverrides: false
    });

    assert.equal(config.overrides.momus, undefined);
    assert.doesNotMatch(readFileSync(configPath, "utf8"), /\[agents\.momus]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given noninteractive OMO override setup when called then keeps configured model", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-models-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
        "",
        "[agents.explorer]",
        'model = "grok-4.3"',
        ""
      ].join("\n")
    );

    const config = await configureAgentModelOverrides(configPath, { interactive: false });

    assert.equal(config.overrides.explorer.model, "grok-4.3");
    assert.match(readFileSync(configPath, "utf8"), /model = "grok-4\.3"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given no discovered model list when user types custom model then writes manual model id", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-models-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(path.join(root, "metis.toml"), agentText("metis", "gpt-5.5", "fast"));
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
        "",
        "[agents.explorer]",
        'model = "grok-4.3"',
        'model_reasoning_effort = "low"',
        'service_tier = "default"',
        ""
      ].join("\n")
    );

    const config = await configureAgentModelOverrides(configPath, {
      models: [],
      readline: fakeReadline(["", "", "", "y", "custom-metis-model", "1", "3"]),
      output: silentOutput(),
      persistUserOverrides: false
    });
    const updated = readFileSync(configPath, "utf8");

    assert.equal(config.overrides.metis.model, "custom-metis-model");
    assert.match(updated, /\[agents\.metis]\nmodel = "custom-metis-model"\nmodel_reasoning_effort = "high"\nservice_tier = "default"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given mixed model payload shapes when normalizing then extracts unique ids", () => {
  assert.deepEqual(normalizeModelsPayload({ models: ["zeta", { id: "alpha" }, { id: "" }, {}] }), ["alpha", "zeta"]);
});

let configOutput = { questions: [] };

function fakeReadline(answers) {
  return {
    question(question, resolve) {
      configOutput.questions.push(question);
      resolve(answers.shift() ?? "");
    }
  };
}

function silentOutput() {
  return { log() {} };
}

function captureOutput() {
  configOutput = { questions: [] };
  return { log() {} };
}

function agentText(name, model, tier) {
  return [`name = "${name}"`, `model = "${model}"`, 'model_reasoning_effort = "high"', `service_tier = "${tier}"`, ""].join("\n");
}
