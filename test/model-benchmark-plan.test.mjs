import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runModelBenchmarks } from "../scripts/model-benchmark.mjs";

test("given normal plan benchmark when applying winner then saves xhigh reasoning fallback", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-benchmark-"));
  try {
    const outputPath = path.join(root, "result.json");
    const codexHome = createCodexHome(root, {
      plan: { model: "slow-model", service_tier: "default" }
    });

    await runModelBenchmarks(
      {
        roles: ["plan"],
        models: ["slow-model", "fast-model"],
        samples: 1,
        dryRun: false,
        apply: true,
        outputPath
      },
      {
        env: { ...process.env, CODEX_HOME: codexHome },
        models: ["slow-model", "fast-model"],
        fetch: async (url, request) => fakePlanCompletion(url, request)
      }
    );
    const saved = JSON.parse(readFileSync(path.join(codexHome, "lfp.json"), "utf8"));

    assert.equal(saved.overrides.plan.model, "fast-model");
    assert.equal(saved.overrides.plan.model_reasoning_effort, "xhigh");
    assert.equal(saved.overrides.plan.service_tier, "default");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createCodexHome(root, overrides) {
  const codexHome = path.join(root, "codex-home");
  mkdirSync(path.join(codexHome, "lfp"), { recursive: true });
  writeFileSync(
    path.join(codexHome, "config.toml"),
    [
      'model_provider = "cliproxyapi"',
      "",
      "[model_providers.cliproxyapi]",
      'base_url = "https://models.example.test/v1"',
      'experimental_bearer_token = "secret"',
      ""
    ].join("\n")
  );
  writeFileSync(
    path.join(codexHome, "lfp.json"),
    `${JSON.stringify({ schemaVersion: 2, source: { agentsDir: "${CODEX_HOME}/agents" }, overrides, rolePolicies: {} }, null, 2)}\n`
  );
  return codexHome;
}

async function fakePlanCompletion(url, request) {
  const body = JSON.parse(request.body);
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      return {
        choices: [
          {
            message: {
              content: body.model === "fast-model" ? "latency score overrides" : "wrong"
            }
          }
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }
      };
    }
  };
}
