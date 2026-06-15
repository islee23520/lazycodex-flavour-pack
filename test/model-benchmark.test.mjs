import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { parseBenchmarkArgs, runModelBenchmarks } from "../scripts/model-benchmark.mjs";

test("given benchmark args when parsing then maps roles models samples and output", () => {
  const args = parseBenchmarkArgs([
    "--dry-run",
    "--recommend-only",
    "--roles",
    "explorer,metis",
    "--models",
    "gpt-5.4-mini,grok-3-mini-fast",
    "--samples",
    "2",
    "--output",
    ".omo/benchmark-results/custom.json",
    "--apply"
  ]);

  assert.deepEqual(args.roles, ["explorer", "metis"]);
  assert.deepEqual(args.models, ["gpt-5.4-mini", "grok-3-mini-fast"]);
  assert.equal(args.samples, 2);
  assert.equal(args.dryRun, true);
  assert.equal(args.recommendOnly, true);
  assert.equal(args.apply, true);
  assert.equal(args.outputPath, ".omo/benchmark-results/custom.json");
});

test("given dry-run benchmark when running then writes redacted result file", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-benchmark-"));
  try {
    const outputPath = path.join(root, "result.json");
    const codexHome = createCodexHome(root, {
      explorer: { model: "gpt-5.4-mini", model_reasoning_effort: "low", service_tier: "default" }
    });

    const result = await runModelBenchmarks(
      {
        roles: ["explorer"],
        models: ["gpt-5.4-mini", "grok-3-mini-fast"],
        samples: 1,
        dryRun: true,
        apply: false,
        outputPath
      },
      { env: { ...process.env, CODEX_HOME: codexHome }, models: ["gpt-5.4-mini", "grok-3-mini-fast"] }
    );
    const written = JSON.parse(readFileSync(outputPath, "utf8"));

    assert.equal(result.runs.length, 2);
    assert.equal(written.provider.bearerToken, "<redacted>");
    assert.equal(written.recommendations.explorer.model.length > 0, true);
    assert.equal(existsSync(outputPath), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given recommend-only benchmark when running then uses available model list without completion calls", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-benchmark-"));
  try {
    const outputPath = path.join(root, "result.json");
    const codexHome = createCodexHome(root, {
      explorer: { model: "gpt-5.4-mini", model_reasoning_effort: "low", service_tier: "default" },
      plan: { model: "gpt-5.5", model_reasoning_effort: "high", service_tier: "default" }
    });

    const result = await runModelBenchmarks(
      {
        roles: ["explorer", "plan"],
        samples: 1,
        dryRun: false,
        recommendOnly: true,
        apply: false,
        outputPath
      },
      {
        env: { ...process.env, CODEX_HOME: codexHome },
        models: ["gpt-5.4-mini", "grok-3-mini-fast", "grok-4.20-0309-reasoning", "gpt-5.5"],
        fetch: async () => {
          throw new Error("completion calls are not allowed in recommend-only mode");
        }
      }
    );

    assert.equal(result.runs.length, 0);
    assert.equal(result.recommendations.explorer.model, "grok-3-mini-fast");
    assert.equal(result.recommendations.plan.model, "grok-4.20-0309-reasoning");
    assert.equal(result.recommendations.plan.model_reasoning_effort, "xhigh");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given reviewer recommendation when spark and gpt55 are available then avoids spark tool incompatibility", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-benchmark-"));
  try {
    const outputPath = path.join(root, "result.json");
    const codexHome = createCodexHome(root, {
      "codex-ultrawork-reviewer": {
        model: "gpt-5.3-codex-spark",
        model_reasoning_effort: "high",
        service_tier: "default"
      }
    });

    const result = await runModelBenchmarks(
      {
        roles: ["codex-ultrawork-reviewer"],
        samples: 1,
        dryRun: false,
        recommendOnly: true,
        apply: false,
        outputPath
      },
      {
        env: { ...process.env, CODEX_HOME: codexHome },
        models: ["gpt-5.3-codex-spark", "gpt-5.5"]
      }
    );

    assert.equal(result.recommendations["codex-ultrawork-reviewer"].model, "gpt-5.5");
    assert.equal(result.recommendations["codex-ultrawork-reviewer"].changed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given apply benchmark when winner changes then updates saved overrides only after evidence", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-benchmark-"));
  try {
    const outputPath = path.join(root, "result.json");
    const codexHome = createCodexHome(root, {
      explorer: { model: "slow-model", model_reasoning_effort: "low", service_tier: "default", model_fallback: "fallback" }
    });

    await runModelBenchmarks(
      {
        roles: ["explorer"],
        models: ["slow-model", "fast-model"],
        samples: 1,
        dryRun: false,
        apply: true,
        outputPath
      },
      {
        env: { ...process.env, CODEX_HOME: codexHome },
        models: ["slow-model", "fast-model"],
        fetch: async (url, request) => fakeCompletion(url, request)
      }
    );
    const saved = JSON.parse(readFileSync(path.join(codexHome, "lfp", "omo-agent-model-overrides.json"), "utf8"));

    assert.equal(saved.overrides.explorer.model, "fast-model");
    assert.equal(saved.overrides.explorer.model_fallback, "fallback");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createCodexHome(root, overrides) {
  const codexHome = path.join(root, "codex-home");
  mkdirSync(path.join(codexHome, "lfp"), { recursive: true });
  writeFileSync(
    path.join(root, "config.toml"),
    '[source]\nagents_dir = "${CODEX_HOME}/agents"\n'
  );
  writeFileSync(
    path.join(codexHome, "config.toml"),
    [
      'model_provider = "cliproxyapi"',
      "",
      "[model_providers.cliproxyapi]",
      'base_url = "https://models.example.test/v1"',
      'experimental_bearer_token = "secret"',
      ""
    ].join("\n"),
    { flag: "w" }
  );
  writeFileSync(
    path.join(codexHome, "lfp", "omo-agent-model-overrides.json"),
    `${JSON.stringify({ schemaVersion: 1, overrides }, null, 2)}\n`,
    { flag: "w" }
  );
  return codexHome;
}

async function fakeCompletion(url, request) {
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
              content: body.model === "fast-model" ? "scripts/cli.mjs entrypoint" : "wrong"
            }
          }
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }
      };
    }
  };
}
