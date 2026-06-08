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

test("given interactive OMO override setup when user selects listed model then writes selected model to TOML", async () => {
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
        ""
      ].join("\n")
    );

    const config = await configureAgentModelOverrides(configPath, {
      models: ["gpt-5.4-mini", "grok-4.3"],
      readline: fakeReadline(["1"]),
      output: silentOutput()
    });
    const updated = readFileSync(configPath, "utf8");

    assert.equal(config.overrides.explorer.model, "gpt-5.4-mini");
    assert.match(updated, /model = "gpt-5\.4-mini"/);
    assert.match(updated, /model_reasoning_effort = "low"/);
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

test("given mixed model payload shapes when normalizing then extracts unique ids", () => {
  assert.deepEqual(normalizeModelsPayload({ models: ["zeta", { id: "alpha" }, { id: "" }, {}] }), ["alpha", "zeta"]);
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
