/**
 * LFP Model + Fallback Resolver
 * Source of truth: the user's ~/.codex/lfp.json
 *
 * Call with { agent: "...", onError: "quota" | "rate-limit" | "429" | "error" }
 * Returns consistent shape with primary / effective always present (or null).
 */

import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPackageRoot } from "../utils/package-root.js";
import { LegacyV1SavedUserOverrideConfigSchema, SavedUserModelOverrideConfigSchema } from "./model-override-schema.js";
import { getUserOverrideConfigPath } from "./user-model-overrides.js";

const LEGACY_JSON_CONFIG_NAME = "omo-agent-model-overrides.json";
const LEGACY_CONFIG_NAME = "omo-agent-model-overrides.toml";

function getLedgerPath(options = {}) {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  const c1 = getUserOverrideConfigPath(options);
  const c2 = path.join(codexHome, "lfp", LEGACY_JSON_CONFIG_NAME);
  const c3 = path.join(codexHome, "lfp", LEGACY_CONFIG_NAME);
  const c4 = path.join(codexHome, ".ledger", "lfp", LEGACY_CONFIG_NAME);
  if (existsSync(c1)) return c1;
  if (existsSync(c2)) return c2;
  if (existsSync(c3)) return c3;
  if (existsSync(c4)) return c4;
  return null;
}

function parseSimpleToml(text) {
  const out = { source: {}, overrides: {} };
  let section = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sec = line.match(/^\[([^\]]+)]$/);
    if (sec) {
      section = sec[1];
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"$/);
    if (!m || !section) continue;
    const [, key, val] = m;
    if (section === "source" && key === "agents_dir") {
      out.source.agentsDir = val;
    } else if (section.startsWith("agents.")) {
      const name = section.slice("agents.".length);
      out.overrides[name] = out.overrides[name] || {};
      out.overrides[name][key] = val;
    }
  }
  return out;
}

export function resolve(agentName, options = {}) {
  let ledgerPath = options.ledgerPath || getLedgerPath(options);
  let parsed = null;

  if (options.ledgerPath && existsSync(options.ledgerPath)) {
    ledgerPath = options.ledgerPath;
  }

  if (!ledgerPath) {
    return {
      agent: agentName,
      primary: null,
      effective: null,
      using_fallback: false,
      reason: "no-ledger",
      source: null,
      fallback_available: false,
      message: "No LFP saved override config found. Run `lfp setup` or `lfp agent-config`."
    };
  }

  try {
    const text = readFileSync(ledgerPath, "utf8");
    parsed = ledgerPath.endsWith(".json") ? parseSavedJson(text) : parseSimpleToml(text);
  } catch (e) {
    return {
      agent: agentName,
      primary: null,
      effective: null,
      using_fallback: false,
      reason: "parse-error",
      source: ledgerPath,
      fallback_available: false,
      error: String(e)
    };
  }

  const entry = parsed.overrides?.[agentName] || {};
  if (!entry.model) {
    return {
      agent: agentName,
      primary: null,
      effective: null,
      using_fallback: false,
      reason: "no-entry",
      source: ledgerPath,
      fallback_available: false,
      message: `No override entry for agent "${agentName}" in LFP saved override config.`
    };
  }

  const primary = {
    model: entry.model,
    model_reasoning_effort: entry.model_reasoning_effort || "low",
    service_tier: entry.service_tier || "default"
  };

  const onError = String(options.onError || options.reason || "").toLowerCase();
  const shouldFallback =
    !!onError &&
    (onError.includes("quota") ||
      onError.includes("rate") ||
      onError.includes("429") ||
      onError.includes("limit") ||
      onError.includes("error") ||
      onError.includes("fail"));

  const effective =
    shouldFallback && entry.model_fallback
      ? {
          model: entry.model_fallback,
          model_reasoning_effort: entry.model_fallback_reasoning_effort || primary.model_reasoning_effort,
          service_tier: entry.model_fallback_service_tier || primary.service_tier
        }
      : primary;

  return {
    agent: agentName,
    primary,
    effective,
    using_fallback: effective.model !== primary.model,
    reason: shouldFallback ? onError || "error" : "primary",
    source: ledgerPath,
    fallback_available: !!entry.model_fallback
  };
}

let cachedChains: { agents: Record<string, string[]>; categories: Record<string, string[]> } | null = null;

function loadFallbackChains() {
  if (cachedChains) return cachedChains;
  const chainsPath = path.join(getPackageRoot(import.meta.url), "agent-configs", "lfp-fallback-chains.toml");
  if (!existsSync(chainsPath)) {
    cachedChains = { agents: {}, categories: {} };
    return cachedChains;
  }
  const text = readFileSync(chainsPath, "utf8");
  const agents: Record<string, string[]> = {};
  const categories: Record<string, string[]> = {};
  let section: "agents" | "categories" | null = null;
  let currentName: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const agentMatch = line.match(/^\[agents\.([A-Za-z0-9_-]+)\]$/);
    if (agentMatch) {
      section = "agents";
      currentName = agentMatch[1];
      continue;
    }
    const catMatch = line.match(/^\[categories\.([A-Za-z0-9_-]+)\]$/);
    if (catMatch) {
      section = "categories";
      currentName = catMatch[1];
      continue;
    }
    const chainMatch = line.match(/^chain\s*=\s*\[(.+)\]$/);
    if (!chainMatch || !currentName || !section) continue;
    const models = chainMatch[1].match(/"([^"]+)"/g);
    const chain = models ? models.map((s) => s.slice(1, -1)) : [];
    if (section === "agents") agents[currentName] = chain;
    else categories[currentName] = chain;
  }
  cachedChains = { agents, categories };
  return cachedChains;
}

export function resolveFallbackChain(agentName: string): string[] {
  const { agents } = loadFallbackChains();
  return agents[agentName] ?? [];
}

export function resolveCategoryFallbackChain(categoryName: string): string[] {
  const { categories } = loadFallbackChains();
  return categories[categoryName] ?? [];
}

function parseSavedJson(text) {
  const raw = JSON.parse(text);
  const parsed =
    raw.schemaVersion === 1
      ? SavedUserModelOverrideConfigSchema.parse({
          schemaVersion: 2,
          source: { agentsDir: "${CODEX_HOME}/agents" },
          overrides: LegacyV1SavedUserOverrideConfigSchema.parse(raw).overrides,
          rolePolicies: {}
        })
      : SavedUserModelOverrideConfigSchema.parse(raw);
  return { source: {}, overrides: parsed.overrides };
}

if (
  process.argv[1] !== undefined &&
  (import.meta.url === `file://${process.argv[1]}` || path.basename(process.argv[1]) === "model-fallback-resolver.ts")
) {
  const agent = process.argv[2];
  const onErrorArg = process.argv.find((a) => a.startsWith("--on-error="));
  const onError = onErrorArg
    ? onErrorArg.split("=")[1]
    : process.argv.includes("--on-error")
      ? process.argv[process.argv.indexOf("--on-error") + 1]
      : null;
  if (!agent) {
    console.error("Usage: npx tsx src/model/model-fallback-resolver.ts <agent> [--on-error quota]");
    process.exit(1);
  }
  console.log(JSON.stringify(resolve(agent, { onError }), null, 2));
}
