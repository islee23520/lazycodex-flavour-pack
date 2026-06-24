import path from "node:path";
import { applyRecommendedOverrides, readCurrentOverrideConfig } from "./model-benchmark-overrides.js";
import { recommendFromAvailableModels } from "./model-benchmark-recommendations.js";
import { runSingleBenchmark, writeBenchmarkResult } from "./model-benchmark-results.js";
import { BENCHMARK_SCENARIOS, DEFAULT_BENCHMARK_ROLES } from "./model-benchmark-scenarios.js";
import { fetchAvailableModels, readActiveModelProvider } from "./model-provider.js";

const DEFAULT_OUTPUT_DIR = ".omo/benchmark-results";

export async function runBenchmarkCommand(argv, options = {}) {
  const args = parseBenchmarkArgs(argv);
  const result = await runModelBenchmarks(args, options);
  printBenchmarkSummary(result, options.output ?? console);
  if (args.apply && result.applied.length > 0) {
    options.output?.log?.(`applied ${result.applied.length} override updates`);
  }
  return result;
}

export async function runModelBenchmarks(args, options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const provider = readActiveModelProvider(options);
  if (provider.baseUrl === null) throw new Error("No active model provider base_url configured");

  const availableModels =
    args.models ?? options.models ?? (await fetchAvailableModels({ ...options, fetch: fetchImpl }));
  const currentConfig = readCurrentOverrideConfig(args.configPath, env);
  const roles = args.roles ?? DEFAULT_BENCHMARK_ROLES;
  const candidates = args.models ?? selectCandidates(availableModels, roles, currentConfig.overrides);
  if (args.recommendOnly) {
    const recommendations = recommendFromAvailableModels({
      roles,
      models: candidates,
      currentOverrides: currentConfig.overrides
    });
    return writeAndReturnResult({
      args,
      provider,
      roles,
      candidates,
      runs: [],
      recommendations,
      applied: args.apply ? applyRecommendedOverrides(currentConfig, recommendations, env) : []
    });
  }

  const runs = [];

  for (const role of roles) {
    const scenario = BENCHMARK_SCENARIOS[role];
    if (scenario === undefined) throw new Error(`Unknown benchmark role: ${role}`);
    for (const model of candidates) {
      for (let sample = 0; sample < args.samples; sample += 1) {
        runs.push(
          await runSingleBenchmark({ role, model, scenario, provider, fetchImpl, env, dryRun: args.dryRun, sample })
        );
      }
    }
  }

  const recommendations = recommendWinners(runs, currentConfig.overrides);
  return writeAndReturnResult({
    args,
    provider,
    roles,
    candidates,
    runs,
    recommendations,
    applied: args.apply && !args.dryRun ? applyRecommendedOverrides(currentConfig, recommendations, env) : []
  });
}

export function parseBenchmarkArgs(argv) {
  const parsed = { samples: 1, dryRun: false, apply: false, recommendOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--dry-run") parsed.dryRun = true;
    else if (item === "--recommend-only") parsed.recommendOnly = true;
    else if (item === "--apply") parsed.apply = true;
    else if (item === "--roles") parsed.roles = splitCsv(readValue(argv, ++index, item));
    else if (item === "--models") parsed.models = splitCsv(readValue(argv, ++index, item));
    else if (item === "--samples") parsed.samples = parsePositiveInteger(readValue(argv, ++index, item), item);
    else if (item === "--output") parsed.outputPath = readValue(argv, ++index, item);
    else if (item === "--config") parsed.configPath = readValue(argv, ++index, item);
    else throw new Error(`Unknown benchmark option: ${item}`);
  }
  parsed.outputPath ??= path.join(DEFAULT_OUTPUT_DIR, `benchmark-${Date.now()}.json`);
  return parsed;
}

function writeAndReturnResult({ args, provider, roles, candidates, runs, recommendations, applied }) {
  const result = {
    created_at: new Date().toISOString(),
    provider: redactProvider(provider),
    dry_run: args.dryRun,
    recommend_only: args.recommendOnly,
    roles,
    candidates,
    runs,
    recommendations,
    applied
  };
  writeBenchmarkResult(args.outputPath, result);
  return result;
}

function recommendWinners(runs, currentOverrides) {
  const byRole = new Map();
  for (const run of runs) {
    const items = byRole.get(run.role) ?? [];
    items.push(run);
    byRole.set(run.role, items);
  }

  const recommendations = {};
  for (const [role, items] of byRole.entries()) {
    const aggregates = aggregateRuns(items);
    const winner = aggregates.filter((item) => item.ok_rate >= 0.8).sort(compareAggregate)[0];
    if (winner === undefined) continue;
    const current = currentOverrides[role] ?? {};
    recommendations[role] = {
      model: winner.model,
      model_reasoning_effort:
        current.model_reasoning_effort ?? BENCHMARK_SCENARIOS[role].currentFallback.model_reasoning_effort,
      service_tier: current.service_tier ?? BENCHMARK_SCENARIOS[role].currentFallback.service_tier,
      benchmark: winner,
      changed: current.model !== winner.model
    };
  }
  return recommendations;
}

function aggregateRuns(runs) {
  const byModel = new Map();
  for (const run of runs) {
    const items = byModel.get(run.model) ?? [];
    items.push(run);
    byModel.set(run.model, items);
  }
  return [...byModel.entries()].map(([model, items]) => ({
    model,
    avg_latency_ms: Math.round(items.reduce((sum, item) => sum + item.latency_ms, 0) / items.length),
    avg_score: round(items.reduce((sum, item) => sum + item.score, 0) / items.length),
    ok_rate: round(items.filter((item) => item.ok).length / items.length)
  }));
}

function compareAggregate(a, b) {
  if (b.avg_score !== a.avg_score) return b.avg_score - a.avg_score;
  if (a.avg_latency_ms !== b.avg_latency_ms) return a.avg_latency_ms - b.avg_latency_ms;
  return a.model.localeCompare(b.model);
}

function selectCandidates(models, roles, overrides) {
  const wanted = new Set();
  for (const role of roles) if (overrides[role]?.model) wanted.add(overrides[role].model);
  for (const model of models) {
    if (
      /^(gpt-5\.5|gpt-5\.4-mini|gpt-5\.3-codex-spark|grok-3-mini-fast|grok-4\.20-0309-reasoning|glm-5\.2|glm-5\.1)$/.test(
        model
      )
    ) {
      wanted.add(model);
    }
  }
  return [...wanted].filter((model) => models.includes(model)).sort((a, b) => a.localeCompare(b));
}

function printBenchmarkSummary(result, output) {
  output.log(`lfp benchmark: wrote ${result.runs.length} runs to ${result.output_path ?? "result file"}`);
  for (const [role, recommendation] of Object.entries(result.recommendations)) {
    output.log(
      `lfp benchmark: ${role}: ${recommendation.model} score=${recommendation.benchmark.avg_score} latency=${recommendation.benchmark.avg_latency_ms}ms${recommendation.changed ? " (candidate change)" : " (current)"}`
    );
  }
}

function redactProvider(provider) {
  return {
    id: provider.id,
    baseUrl: provider.baseUrl,
    bearerToken: provider.bearerToken ? "<redacted>" : null,
    bearerTokenEnv: provider.bearerTokenEnv
  };
}

function splitCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsePositiveInteger(value, optionName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${optionName} must be a positive integer`);
  return parsed;
}

function readValue(argv, index, optionName) {
  const value = argv[index];
  if (value === undefined) throw new Error(`${optionName} requires a value`);
  return value;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
