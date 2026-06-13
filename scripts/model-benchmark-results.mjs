import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 120000;

export async function runSingleBenchmark({ role, model, scenario, provider, fetchImpl, env, dryRun, sample }) {
  const started = performance.now();
  if (dryRun) {
    return makeRunResult({ role, model, sample, latencyMs: 0, output: `dry-run ${scenario.checks.join(" ")}`, error: null, scenario });
  }

  try {
    const response = await fetchImpl(new URL("chat/completions", withTrailingSlash(provider.baseUrl)), {
      method: "POST",
      headers: requestHeaders(provider, env),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: "Answer concisely. Prefer compact JSON. Do not include secrets." },
          { role: "user", content: scenario.prompt }
        ]
      })
    });
    const latencyMs = Math.round(performance.now() - started);
    const payload = await readJsonPayload(response);
    const output = payload?.choices?.[0]?.message?.content ?? "";
    const error = response.ok ? null : `${response.status} ${response.statusText}`;
    return makeRunResult({ role, model, sample, latencyMs, output, error, scenario, usage: payload?.usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return makeRunResult({ role, model, sample, latencyMs: Math.round(performance.now() - started), output: "", error: message, scenario });
  }
}

export function writeBenchmarkResult(outputPath, result) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  result.output_path = outputPath;
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

function makeRunResult({ role, model, sample, latencyMs, output, error, scenario, usage = null }) {
  const hits = scenario.checks.filter((check) => output.toLowerCase().includes(check.toLowerCase())).length;
  const score = error === null ? hits / scenario.checks.length : 0;
  return { role, model, sample, latency_ms: latencyMs, score, ok: score >= 0.67, error, output: output.slice(0, 500), usage: sanitizeUsage(usage) };
}

function requestHeaders(provider, env) {
  const token = provider.bearerToken ?? readBearerTokenFromEnv(provider, env);
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
}

async function readJsonPayload(response) {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return {};
    throw error;
  }
}

function readBearerTokenFromEnv(provider, env) {
  if (provider.bearerTokenEnv && env[provider.bearerTokenEnv]?.trim()) return env[provider.bearerTokenEnv].trim();
  if (env.OPENAI_API_KEY?.trim()) return env.OPENAI_API_KEY.trim();
  return null;
}

function sanitizeUsage(usage) {
  if (usage === null || typeof usage !== "object") return null;
  return {
    prompt_tokens: Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : null,
    completion_tokens: Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null,
    total_tokens: Number.isFinite(usage.total_tokens) ? usage.total_tokens : null
  };
}

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
