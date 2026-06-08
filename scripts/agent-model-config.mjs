#!/usr/bin/env node
import os from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readOverrideConfig } from "./sync-agent-overrides.mjs";

const MODEL_FIELD = "model";
const WRITABLE_FIELDS = new Set(["model", "service_tier"]);
const SERVICE_TIERS = [
  { value: "default", label: "default (non-fast)" },
  { value: "fast", label: "fast" }
];
const DEFAULT_CONFIG_NAME = "config.toml";

export async function configureAgentModelOverrides(configPath, options = {}) {
  if (options.interactive === false) return readOverrideConfig(configPath, options);

  const config = readOverrideConfig(configPath, options);
  const agentNames = Object.keys(config.overrides ?? {});
  if (agentNames.length === 0) return config;

  const models = options.models ?? (await safeFetchAvailableModels(options));
  if (models.length === 0) {
    options.output?.log?.("No available models were discovered; keeping configured OMO override models.");
    return config;
  }

  const rl = options.readline;
  if (rl === undefined) throw new TypeError("readline is required for interactive model override configuration");

  options.output?.log?.("\n=== OMO Agent Model Overrides ===");
  options.output?.log?.("Choose models for existing non-art LazyCodex/OMO agents.\n");
  printModelChoices(models, options.output);

  for (const agentName of agentNames) {
    const fields = config.overrides[agentName] ?? {};
    const current = typeof fields.model === "string" ? fields.model : models[0];
    const selected = await promptForModel(rl, {
      agentName,
      current,
      models,
      output: options.output
    });
    fields.model = selected;
    fields.service_tier = await promptForServiceTier(rl, {
      agentName,
      current: typeof fields.service_tier === "string" ? fields.service_tier : "default",
      output: options.output
    });
    config.overrides[agentName] = fields;
  }

  writeOverrideFields(configPath, config.overrides);
  options.output?.log?.("OMO override model configuration written.\n");
  return config;
}

export async function fetchAvailableModels(options = {}) {
  const provider = readActiveModelProvider(options);
  if (provider.baseUrl === null) return [];

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return [];

  const url = new URL("models", withTrailingSlash(provider.baseUrl));
  const headers = {};
  const token = provider.bearerToken ?? readBearerTokenFromEnv(provider, options.env ?? process.env);
  if (token !== null) headers.authorization = `Bearer ${token}`;

  const response = await fetchImpl(url, { headers });
  if (!response.ok) return [];

  const payload = await response.json();
  return normalizeModelsPayload(payload);
}

async function safeFetchAvailableModels(options) {
  try {
    return await fetchAvailableModels(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.output?.log?.(`Could not discover available models: ${message}`);
    return [];
  }
}

export function readActiveModelProvider(options = {}) {
  const env = options.env ?? process.env;
  const configPath = options.codexConfigPath ?? path.join(env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex"), DEFAULT_CONFIG_NAME);
  const text = readFileSync(configPath, "utf8");
  const activeProvider = readTopLevelTomlString(text, "model_provider");
  if (activeProvider === null) return { id: null, baseUrl: null, bearerToken: null, bearerTokenEnv: null };

  const providerBlock = getTableBlock(text, `model_providers.${activeProvider}`);
  return {
    id: activeProvider,
    baseUrl: readTomlString(providerBlock, "base_url"),
    bearerToken: readTomlString(providerBlock, "experimental_bearer_token"),
    bearerTokenEnv: readTomlString(providerBlock, "env_key") ?? readTomlString(providerBlock, "api_key_env")
  };
}

export function normalizeModelsPayload(payload) {
  const entries = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  const models = [];

  for (const entry of entries) {
    const model = typeof entry === "string" ? entry : entry?.id;
    if (typeof model === "string" && model.trim().length > 0) models.push(model.trim());
  }

  return [...new Set(models)].sort((a, b) => a.localeCompare(b));
}

export function writeOverrideFields(configPath, overrides) {
  if (!configPath.endsWith(".toml")) return;

  const lines = readFileSync(configPath, "utf8").split(/\r?\n/);
  const output = [];
  let section = null;

  for (const line of lines) {
    const sectionMatch = line.trim().match(/^\[([A-Za-z0-9_.-]+)]$/);
    if (sectionMatch) section = sectionMatch[1];

    const agentName = section?.startsWith("agents.") ? section.slice("agents.".length) : null;
    const key = line.includes("=") ? line.split("=", 1)[0].trim() : "";
    if (agentName !== null && WRITABLE_FIELDS.has(key) && overrides[agentName]?.[key]) {
      output.push(`${key} = ${JSON.stringify(String(overrides[agentName][key]))}`);
      continue;
    }

    output.push(line);
  }

  writeFileSync(configPath, `${output.join("\n").replace(/\n*$/, "")}\n`);
}

export const writeOverrideModels = writeOverrideFields;

async function promptForModel(rl, { agentName, current, models, output }) {
  const defaultIndex = models.includes(current) ? models.indexOf(current) + 1 : null;
  const suffix = defaultIndex === null ? `[${current}]` : `[${defaultIndex}]`;

  while (true) {
    const answer = (await prompt(rl, `  ${agentName} model ${suffix}: `)).trim();
    if (answer.length === 0) return current;

    const selected = parseModelSelection(answer, models);
    if (selected !== null) return selected;

    output?.log?.("  Choose a listed number or model id.");
  }
}

async function promptForServiceTier(rl, { agentName, current, output }) {
  printServiceTierChoices(output);
  const defaultIndex = SERVICE_TIERS.findIndex((tier) => tier.value === current) + 1;
  const suffix = defaultIndex > 0 ? `[${defaultIndex}]` : `[${current}]`;

  while (true) {
    const answer = (await prompt(rl, `  ${agentName} service tier ${suffix}: `)).trim();
    if (answer.length === 0) return current;

    const selected = parseServiceTierSelection(answer);
    if (selected !== null) return selected;

    output?.log?.("  Choose 1 for default/non-fast or 2 for fast.");
  }
}

function parseServiceTierSelection(answer) {
  if (/^[0-9]+$/.test(answer)) return SERVICE_TIERS[Number(answer) - 1]?.value ?? null;
  return SERVICE_TIERS.some((tier) => tier.value === answer) ? answer : null;
}

function printServiceTierChoices(output) {
  for (const [index, tier] of SERVICE_TIERS.entries()) {
    output?.log?.(`  ${index + 1}. ${tier.label}`);
  }
}

function parseModelSelection(answer, models) {
  if (/^[0-9]+$/.test(answer)) {
    const index = Number(answer) - 1;
    return models[index] ?? null;
  }

  return models.includes(answer) ? answer : null;
}

function printModelChoices(models, output) {
  for (const [index, model] of models.entries()) {
    output?.log?.(`  ${index + 1}. ${model}`);
  }
  output?.log?.("");
}

function readBearerTokenFromEnv(provider, env) {
  if (provider.bearerTokenEnv && env[provider.bearerTokenEnv]?.trim()) return env[provider.bearerTokenEnv].trim();
  if (env.OPENAI_API_KEY?.trim()) return env.OPENAI_API_KEY.trim();
  return null;
}

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function getTableBlock(text, tableName) {
  const pattern = new RegExp(`(^|\\n)\\[${escapeRegExp(tableName)}]\\n([\\s\\S]*?)(?=\\n\\[[^\\n]+]|$)`);
  return pattern.exec(text)?.[2] ?? "";
}

function readTopLevelTomlString(text, key) {
  const firstTable = /^\[[^\n]+]/m.exec(text);
  const topLevel = firstTable === null ? text : text.slice(0, firstTable.index);
  return readTomlString(topLevel, key);
}

function readTomlString(text, key) {
  const match = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, "m").exec(text);
  return match?.[1] ?? null;
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
