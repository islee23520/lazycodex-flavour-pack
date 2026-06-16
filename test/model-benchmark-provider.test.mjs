import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runModelBenchmarks } from "../scripts/model-benchmark.mjs";

test("given recommend-only benchmark has explicit models when running then does not fetch provider models", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-benchmark-"));
  try {
    const outputPath = path.join(root, "result.json");
    const codexHome = createCodexHome(root, {
      explorer: { model: "gpt-5.4-mini", model_reasoning_effort: "low", service_tier: "default" }
    });

    const result = await runModelBenchmarks(
      {
        roles: ["explorer"],
        models: ["grok-3-mini-fast", "gpt-5.4-mini"],
        samples: 1,
        dryRun: false,
        recommendOnly: true,
        apply: false,
        outputPath
      },
      {
        env: { ...process.env, CODEX_HOME: codexHome },
        fetch: async () => {
          throw new Error("provider model fetch is not allowed when --models is explicit");
        }
      }
    );

    assert.equal(result.recommendations.explorer.model, "grok-3-mini-fast");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given benchmark provider uses env key when running completions then sends configured bearer token", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-benchmark-"));
  try {
    const outputPath = path.join(root, "result.json");
    const codexHome = createCodexHome(root, {
      explorer: { model: "gpt-5.4-mini", model_reasoning_effort: "low", service_tier: "default" }
    }, ['env_key = "MODEL_API_KEY"']);

    await runModelBenchmarks(
      {
        roles: ["explorer"],
        models: ["gpt-5.4-mini"],
        samples: 1,
        dryRun: false,
        apply: false,
        outputPath
      },
      {
        env: { ...process.env, CODEX_HOME: codexHome, MODEL_API_KEY: "env-secret" },
        models: ["gpt-5.4-mini"],
        fetch: async (_url, request) => {
          assert.equal(request.headers.authorization, "Bearer env-secret");
          return fakeCompletion(request);
        }
      }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createCodexHome(root, overrides, providerAuthLines = ['experimental_bearer_token = "secret"']) {
  const codexHome = path.join(root, "codex-home");
  mkdirSync(path.join(codexHome, "lfp"), { recursive: true });
  writeFileSync(
    path.join(codexHome, "config.toml"),
    [
      'model_provider = "cliproxyapi"',
      "",
      "[model_providers.cliproxyapi]",
      'base_url = "https://models.example.test/v1"',
      ...providerAuthLines,
      ""
    ].join("\n")
  );
  writeFileSync(
    path.join(codexHome, "lfp.json"),
    `${JSON.stringify({ schemaVersion: 2, source: { agentsDir: "${CODEX_HOME}/agents" }, overrides, rolePolicies: {} }, null, 2)}\n`
  );
  return codexHome;
}

async function fakeCompletion(request) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      return {
        choices: [{ message: { content: JSON.parse(request.body).model } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }
      };
    }
  };
}
