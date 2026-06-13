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

test("given setup recommendation flow when user presses enter per agent then writes recommended available models", async () => {
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
        'model_reasoning_effort = "medium"',
        'service_tier = "default"',
        "",
        "[agents.librarian]",
        'model = "grok-4.3"',
        'model_reasoning_effort = "medium"',
        'service_tier = "default"',
        "",
        "[agents.metis]",
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "low"',
        'service_tier = "fast"',
        ""
      ].join("\n")
    );
    const output = captureOutput();

    const config = await configureAgentModelOverrides(configPath, {
      models: ["gpt-5.4-mini", "gpt-5.5", "grok-4.3"],
      readline: fakeReadline(["", "", "", "", "", "", "", "", ""]),
      output,
      recommendModels: true,
      persistUserOverrides: false
    });
    const updated = readFileSync(configPath, "utf8");

    assert.equal(config.overrides.explorer.model, "gpt-5.4-mini");
    assert.equal(config.overrides.explorer.service_tier, "fast");
    assert.equal(config.overrides.explorer.model_reasoning_effort, "low");
    assert.equal(config.overrides.librarian.model, "gpt-5.4-mini");
    assert.equal(config.overrides.librarian.service_tier, "fast");
    assert.equal(config.overrides.librarian.model_reasoning_effort, "low");
    assert.equal(config.overrides.metis.model, "gpt-5.5");
    assert.equal(config.overrides.metis.service_tier, "default");
    assert.equal(config.overrides.metis.model_reasoning_effort, "high");
    assert.ok(configOutput.questions.some((question) => /explorer model \[1]/.test(question)));
    assert.ok(configOutput.questions.some((question) => /librarian model \[1]/.test(question)));
    assert.ok(configOutput.questions.some((question) => /metis model \[2]/.test(question)));
    assert.match(updated, /\[agents\.explorer]\nmodel = "gpt-5\.4-mini"\nmodel_reasoning_effort = "low"\nservice_tier = "fast"/);
    assert.match(updated, /\[agents\.metis]\nmodel = "gpt-5\.5"\nmodel_reasoning_effort = "high"\nservice_tier = "default"/);
    assert.match(output.lines.join("\n"), /Recommendation: gpt-5\.4-mini/);
    assert.match(output.lines.join("\n"), /Available models \(enter number or exact model id\):/);
    assert.match(output.lines.join("\n"), /Agent: explorer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given setup recommendation flow when user overrides one agent then keeps manual selection", async () => {
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
        'model_reasoning_effort = "medium"',
        'service_tier = "default"',
        ""
      ].join("\n")
    );

    const config = await configureAgentModelOverrides(configPath, {
      models: ["gpt-5.4-mini", "gpt-5.5", "grok-4.3"],
      readline: fakeReadline(["3", "1", "2"]),
      output: silentOutput(),
      recommendModels: true,
      persistUserOverrides: false
    });

    assert.equal(config.overrides.explorer.model, "grok-4.3");
    assert.equal(config.overrides.explorer.service_tier, "default");
    assert.equal(config.overrides.explorer.model_reasoning_effort, "medium");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given setup confirm configured flow when user presses enter then re-applies existing values", async () => {
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
        'model_reasoning_effort = "medium"',
        'service_tier = "default"',
        "",
        "[agents.metis]",
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "low"',
        'service_tier = "fast"',
        ""
      ].join("\n")
    );
    const output = captureOutput();

    const config = await configureAgentModelOverrides(configPath, {
      models: ["gpt-5.4-mini", "gpt-5.5", "grok-4.3"],
      readline: fakeReadline(["", "", "", "", "", ""]),
      output,
      recommendModels: true,
      confirmConfiguredValues: true,
      persistUserOverrides: false
    });

    assert.equal(config.overrides.explorer.model, "grok-4.3");
    assert.equal(config.overrides.explorer.service_tier, "default");
    assert.equal(config.overrides.explorer.model_reasoning_effort, "medium");
    assert.equal(config.overrides.metis.model, "gpt-5.4-mini");
    assert.equal(config.overrides.metis.service_tier, "fast");
    assert.equal(config.overrides.metis.model_reasoning_effort, "low");
    assert.ok(configOutput.questions.some((question) => /explorer model \[3]/.test(question)));
    assert.ok(configOutput.questions.some((question) => /metis model \[1]/.test(question)));
    assert.match(output.lines.join("\n"), /Recommendation: gpt-5\.5/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given default and ULW model sections when configuring setup then prompts and writes them before per-agent overrides", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-models-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
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
        "",
        "[agents.explorer]",
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "low"',
        'service_tier = "fast"',
        ""
      ].join("\n")
    );
    const output = captureOutput();

    const config = await configureAgentModelOverrides(configPath, {
      models: ["gpt-5.4-mini", "gpt-5.5", "grok-4.3"],
      readline: fakeReadline(["3", "1", "2", "", "", "", "", "", ""]),
      output,
      confirmConfiguredValues: true,
      persistUserOverrides: false
    });
    const updated = readFileSync(configPath, "utf8");

    assert.equal(config.overrides.default.model, "grok-4.3");
    assert.equal(config.overrides.default.service_tier, "default");
    assert.equal(config.overrides.default.model_reasoning_effort, "medium");
    assert.equal(config.overrides.ulw.model, "gpt-5.5");
    assert.equal(config.overrides.ulw.model_reasoning_effort, "xhigh");
    assert.match(output.lines.join("\n"), /=== Default Model Settings ===/);
    assert.ok(configOutput.questions.findIndex((question) => /Default Codex model/.test(question)) < configOutput.questions.findIndex((question) => /explorer model/.test(question)));
    assert.ok(configOutput.questions.some((question) => /ULW model/.test(question)));
    assert.match(updated, /\[agents\.default]\nmodel = "grok-4\.3"\nmodel_reasoning_effort = "medium"\nservice_tier = "default"/);
    assert.match(updated, /\[agents\.ulw]\nmodel = "gpt-5\.5"\nmodel_reasoning_effort = "xhigh"\nservice_tier = "default"/);
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

    const output = captureOutput();
    const config = await configureAgentModelOverrides(configPath, {
      models: [],
      readline: fakeReadline(["", "", "", "y", "custom-metis-model", "1", "3"]),
      output,
      persistUserOverrides: false
    });
    const updated = readFileSync(configPath, "utf8");
    const outputText = output.lines.join("\n");

    assert.equal(config.overrides.metis.model, "custom-metis-model");
    assert.match(updated, /\[agents\.metis]\nmodel = "custom-metis-model"\nmodel_reasoning_effort = "high"\nservice_tier = "default"/);
    assert.match(outputText, /Default: keep the current LazyCodex\/OMO value/);
    assert.doesNotMatch(outputText, /Guide: gpt-5\.5/);
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
  return {
    lines: [],
    log(line = "") {
      this.lines.push(line);
    }
  };
}

function agentText(name, model, tier) {
  return [`name = "${name}"`, `model = "${model}"`, 'model_reasoning_effort = "high"', `service_tier = "${tier}"`, ""].join("\n");
}
