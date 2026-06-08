#!/usr/bin/env node
import os from "node:os";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  logAgentGuide,
  printModelChoices,
  promptForModel,
  promptForReasoningEffort,
  promptForServiceTier,
  promptForYesNo
} from "./model-config-prompts.mjs";
import { readOverrideConfig } from "./sync-agent-overrides.mjs";
import {
  getUserOverrideConfigPath,
  hasSavedUserOverrideConfig,
  restoreUserOverrideConfig,
  saveUserOverrideConfig
} from "./user-model-overrides.mjs";

const MODEL_FIELD = "model";
const WRITABLE_FIELDS = ["model", "model_reasoning_effort", "service_tier"];
const LFP_AGENT_NAMES = new Set(["artistry", "artistry-gen", "artistry-qa", "visual-engineering", "visual-looker"]);
const DEFAULT_CONFIG_NAME = "config.toml";

export { getUserOverrideConfigPath };

export async function configureAgentModelOverrides(configPath, options = {}) {
  if (options.interactive === false) return readOverrideConfig(configPath, options);

  const rl = options.readline;
  if (rl === undefined) throw new TypeError("readline is required for interactive model override configuration");

  const userConfigPath = getUserOverrideConfigPath(options);
  const restored = await maybeRestoreUserOverrideConfig(configPath, userConfigPath, { ...options, readline: rl });
  if (restored !== null) return restored;

  const config = readOverrideConfig(configPath, options);
  const agentNames = Object.keys(config.overrides ?? {});
  const additionalAgents = options.additionalAgents ?? discoverAdditionalAgents(config.source?.agentsDir, config.overrides ?? {});
  if (agentNames.length === 0 && additionalAgents.length === 0) return config;

  const models = options.models ?? (await safeFetchAvailableModels(options));
  if (models.length === 0) {
    options.output?.log?.("No available models were discovered; keeping configured OMO override models.");
    return config;
  }

  options.output?.log?.("\n=== OMO Agent Model Overrides ===");
  options.output?.log?.("Choose models for existing non-art LazyCodex/OMO agents.\n");
  printModelChoices(models, options.output);

  for (const agentName of agentNames) {
    const fields = config.overrides[agentName] ?? {};
    const current = typeof fields.model === "string" ? fields.model : models[0];
    const currentReasoning = typeof fields.model_reasoning_effort === "string" ? fields.model_reasoning_effort : "low";
    logAgentGuide(options.output, agentName, {
      model: current,
      reasoning: currentReasoning,
      tier: typeof fields.service_tier === "string" ? fields.service_tier : "default"
    });
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
    fields.model_reasoning_effort = await promptForReasoningEffort(rl, {
      agentName,
      current: currentReasoning,
      output: options.output
    });
    config.overrides[agentName] = fields;
  }

  for (const agent of additionalAgents) {
    const shouldChange = await promptForYesNo(
      rl,
      `  Change ${agent.name} (current: ${agent.model ?? "unknown"}) model/tier/reasoning too? [y/N]: `
    );
    if (!shouldChange) continue;

    logAgentGuide(options.output, agent.name, {
      model: agent.model,
      reasoning: agent.model_reasoning_effort,
      tier: agent.service_tier
    });
    config.overrides[agent.name] = {
      model: await promptForModel(rl, {
        agentName: agent.name,
        current: agent.model ?? models[0],
        models,
        output: options.output
      }),
      service_tier: await promptForServiceTier(rl, {
        agentName: agent.name,
        current: agent.service_tier ?? "default",
        output: options.output
      }),
      model_reasoning_effort: await promptForReasoningEffort(rl, {
        agentName: agent.name,
        current: agent.model_reasoning_effort ?? "medium",
        output: options.output
      })
    };
  }

  writeOverrideFields(configPath, config.overrides);
  saveUserOverrideConfig(configPath, userConfigPath);
  options.output?.log?.("OMO override model configuration written.\n");
  return config;
}

export function discoverAdditionalAgents(sourceDir, overrides) {
  if (typeof sourceDir !== "string") return [];
  const configured = new Set(Object.keys(overrides ?? {}));
  const agents = [];

  for (const fileName of safeReadDir(sourceDir)) {
    if (!fileName.endsWith(".toml")) continue;
    const name = fileName.slice(0, -".toml".length);
    if (configured.has(name) || LFP_AGENT_NAMES.has(name)) continue;

    const text = readFileSync(path.join(sourceDir, fileName), "utf8");
    agents.push({
      name,
      model: readTomlString(text, "model"),
      model_reasoning_effort: readTomlString(text, "model_reasoning_effort"),
      service_tier: readTomlString(text, "service_tier")
    });
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
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
  const seenAgentSections = new Set();

  for (const line of lines) {
    const sectionMatch = line.trim().match(/^\[([A-Za-z0-9_.-]+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (section.startsWith("agents.")) seenAgentSections.add(section.slice("agents.".length));
    }

    const agentName = section?.startsWith("agents.") ? section.slice("agents.".length) : null;
    const key = line.includes("=") ? line.split("=", 1)[0].trim() : "";
    if (agentName !== null && WRITABLE_FIELDS.includes(key) && overrides[agentName]?.[key]) {
      output.push(`${key} = ${JSON.stringify(String(overrides[agentName][key]))}`);
      continue;
    }

    output.push(line);
  }

  for (const [agentName, fields] of Object.entries(overrides)) {
    if (seenAgentSections.has(agentName)) continue;
    output.push("", `[agents.${agentName}]`);
    for (const key of WRITABLE_FIELDS) {
      if (fields?.[key]) output.push(`${key} = ${JSON.stringify(String(fields[key]))}`);
    }
  }

  writeFileSync(configPath, `${output.join("\n").replace(/\n*$/, "")}\n`);
}

export const writeOverrideModels = writeOverrideFields;

async function maybeRestoreUserOverrideConfig(configPath, userConfigPath, options) {
  if (options.persistUserOverrides === false || !configPath.endsWith(".toml") || !hasSavedUserOverrideConfig(userConfigPath)) {
    return null;
  }

  const shouldApply = await promptForYesNo(
    options.readline,
    `  Apply saved LFP model override config from ${userConfigPath}? [y/N]: `
  );
  if (!shouldApply) return null;

  restoreUserOverrideConfig(configPath, userConfigPath);
  options.output?.log?.("Applied saved LFP model override config.\n");
  return readOverrideConfig(configPath, options);
}

function safeReadDir(sourceDir) {
  try {
    return readdirSync(sourceDir);
  } catch {
    return [];
  }
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
