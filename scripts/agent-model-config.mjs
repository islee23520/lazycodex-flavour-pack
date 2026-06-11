#!/usr/bin/env node
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
  migrateLegacyUserOverrideConfig,
  restoreUserOverrideConfig,
  saveUserOverrideConfig
} from "./user-model-overrides.mjs";
import { fetchAvailableModels } from "./model-provider.mjs";
import { buildRecommendedModelOverrides } from "./model-recommendations.mjs";

const MODEL_FIELD = "model";
const WRITABLE_FIELDS = ["model", "model_reasoning_effort", "service_tier"];
const LFP_AGENT_NAMES = new Set(["artistry", "artistry-gen", "artistry-qa", "visual-engineering", "visual-looker"]);

export { getUserOverrideConfigPath };
export { fetchAvailableModels, normalizeModelsPayload, readActiveModelProvider } from "./model-provider.mjs";

export async function configureAgentModelOverrides(configPath, options = {}) {
  if (options.interactive === false) return readOverrideConfig(configPath, options);

  const rl = options.readline;
  if (rl === undefined) throw new TypeError("readline is required for interactive model override configuration");

  const userConfigPath = migrateLegacyUserOverrideConfig(options);

  const savedOverrideChoice = await maybeRestoreUserOverrideConfig(configPath, userConfigPath, { ...options, readline: rl });
  if (savedOverrideChoice === "keep") return readOverrideConfig(configPath, options);
  if (savedOverrideChoice === "adjust") options.output?.log?.("Continuing with editable model override prompts.\n");

  const config = readOverrideConfig(configPath, options);
  const agentNames = Object.keys(config.overrides ?? {});
  const additionalAgents = options.additionalAgents ?? discoverAdditionalAgents(config.source?.agentsDir, config.overrides ?? {});
  if (agentNames.length === 0 && additionalAgents.length === 0) return config;

  const models = options.models ?? (await safeFetchAvailableModels(options));
  if (models.length === 0) {
    options.output?.log?.("No available models were discovered; enter model IDs manually.");
  }

  options.output?.log?.("\n=== OMO Agent Model Overrides ===");
  options.output?.log?.("Choose models for existing non-art LazyCodex/OMO agents.\n");
  if (models.length > 0) printModelChoices(models, options.output);

  const recommendations =
    (options.recommendModels === true || options.offerAutoRecommend === true) && models.length > 0
      ? buildRecommendedModelOverrides(config.overrides, models)
      : {};

  for (const agentName of agentNames) {
    const fields = config.overrides[agentName] ?? {};
    const recommended = recommendations[agentName] ?? {};
    const current = typeof fields.model === "string" ? fields.model : models[0];
    const currentReasoning = typeof fields.model_reasoning_effort === "string" ? fields.model_reasoning_effort : "low";
    const defaultModel = recommended.model ?? current;
    const defaultTier = recommended.service_tier ?? (typeof fields.service_tier === "string" ? fields.service_tier : "default");
    const defaultReasoning = recommended.model_reasoning_effort ?? currentReasoning;
    logAgentGuide(options.output, agentName, {
      model: current,
      reasoning: currentReasoning,
      tier: typeof fields.service_tier === "string" ? fields.service_tier : "default"
    }, { preferCurrent: true });
    logAgentRecommendation(options.output, recommended);
    const selected = await promptForModel(rl, {
      agentName,
      current: defaultModel,
      models,
      output: options.output
    });
    fields.model = selected;
    fields.service_tier = await promptForServiceTier(rl, {
      agentName,
      current: defaultTier,
      output: options.output
    });
    fields.model_reasoning_effort = await promptForReasoningEffort(rl, {
      agentName,
      current: defaultReasoning,
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
    }, { preferCurrent: true });
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

async function safeFetchAvailableModels(options) {
  try {
    return await fetchAvailableModels(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.output?.log?.(`Could not discover available models: ${message}`);
    return [];
  }
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

  const shouldAdjust = await promptForYesNo(
    options.readline,
    `  Adjust LFP model overrides now? Saved settings: ${userConfigPath} [y/N]: `
  );
  if (!shouldAdjust) {
    restoreUserOverrideConfig(configPath, userConfigPath);
    options.output?.log?.("Keeping saved LFP model override settings.\n");
    return "keep";
  }

  restoreUserOverrideConfig(configPath, userConfigPath);
  options.output?.log?.("Loaded saved settings for adjustment.\n");
  return "adjust";
}

function logAgentRecommendation(output, recommendation) {
  if (!recommendation.model) return;
  output?.log?.(
    `  Recommendation: ${recommendation.model} (reasoning: ${recommendation.model_reasoning_effort}, tier: ${recommendation.service_tier})`
  );
}

function safeReadDir(sourceDir) {
  try {
    return readdirSync(sourceDir);
  } catch {
    return [];
  }
}

function readTomlString(text, key) {
  const match = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, "m").exec(text);
  return match?.[1] ?? null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
