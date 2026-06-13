#!/usr/bin/env node
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
import { getCompatibleReasoningEffort } from "./model-reasoning-compat.mjs";
import { discoverAdditionalAgents, writeOverrideFields } from "./agent-model-config-io.mjs";

const DEFAULT_MODEL_SECTIONS = new Map([
  ["default", "Default Codex"],
  ["ulw", "ULW"]
]);

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
  const defaultModelNames = Object.keys(config.overrides ?? {}).filter((name) => DEFAULT_MODEL_SECTIONS.has(name));
  const agentNames = Object.keys(config.overrides ?? {}).filter((name) => !DEFAULT_MODEL_SECTIONS.has(name));
  const additionalAgents = options.additionalAgents ?? discoverAdditionalAgents(config.source?.agentsDir, config.overrides ?? {});
  if (defaultModelNames.length === 0 && agentNames.length === 0 && additionalAgents.length === 0) return config;

  const models = options.models ?? (await safeFetchAvailableModels(options));
  if (models.length === 0) {
    options.output?.log?.("No available models were discovered; enter model IDs manually.");
  }

  if (models.length > 0) printModelChoices(models, options.output);

  const recommendations =
    (options.recommendModels === true || options.offerAutoRecommend === true) && models.length > 0
      ? buildRecommendedModelOverrides(config.overrides, models)
      : {};

  if (defaultModelNames.length > 0) {
    options.output?.log?.("=== Default Model Settings ===");
    options.output?.log?.("Choose Codex default models. ULW is used for ultrawork runs and related defaults.\n");
  }

  for (const agentName of defaultModelNames) {
    await promptForModelSection(config, agentName, {
      displayName: DEFAULT_MODEL_SECTIONS.get(agentName),
      models,
      output: options.output,
      confirmConfiguredValues: options.confirmConfiguredValues,
      modelSelector: options.modelSelector,
      tierSelector: options.tierSelector,
      reasoningSelector: options.reasoningSelector,
      readline: rl
    });
  }

  if (agentNames.length > 0) {
    options.output?.log?.("\n=== OMO Agent Model Overrides ===");
    options.output?.log?.("Choose models for existing non-art LazyCodex/OMO agents.");
    options.output?.log?.("Each agent prompt shows the agent name, current config, and selected fields.\n");
  }

  for (const agentName of agentNames) {
    const fields = config.overrides[agentName] ?? {};
    const recommended = recommendations[agentName] ?? {};
    const current = typeof fields.model === "string" ? fields.model : models[0];
    const currentReasoning = typeof fields.model_reasoning_effort === "string" ? fields.model_reasoning_effort : "low";
    const currentTier = typeof fields.service_tier === "string" ? fields.service_tier : "default";
    const useConfiguredDefaults = options.confirmConfiguredValues === true;
    const defaultModel = useConfiguredDefaults ? current : (recommended.model ?? current);
    const defaultTier = useConfiguredDefaults ? currentTier : (recommended.service_tier ?? currentTier);
    const defaultReasoning = useConfiguredDefaults ? currentReasoning : (recommended.model_reasoning_effort ?? currentReasoning);
    logAgentGuide(options.output, agentName, {
      model: current,
      reasoning: currentReasoning,
      tier: currentTier
    }, { preferCurrent: true });
    logAgentRecommendation(options.output, recommended);
    const selected = await promptForModel(rl, {
      agentName,
      displayName: agentName,
      current: defaultModel,
      models,
      output: options.output,
      modelSelector: options.modelSelector
    });
    fields.model = selected;
    fields.service_tier = await promptForServiceTier(rl, {
      agentName,
      displayName: agentName,
      current: defaultTier,
      output: options.output,
      tierSelector: options.tierSelector
    });
    fields.model_reasoning_effort = getCompatibleReasoningEffort(fields.model, await promptForReasoningEffort(rl, {
      agentName,
      displayName: agentName,
      current: defaultReasoning,
      output: options.output,
      reasoningSelector: options.reasoningSelector
    }));
    config.overrides[agentName] = fields;
  }

  for (const agent of additionalAgents) {
    const shouldChange = await promptForYesNo(
      rl,
      `  Change ${agent.name} (current: ${agent.model ?? "unknown"}) model/tier/reasoning too? [y/N]: `,
      { yesNoSelector: options.yesNoSelector }
    );
    if (!shouldChange) continue;

    logAgentGuide(options.output, agent.name, {
      model: agent.model,
      reasoning: agent.model_reasoning_effort,
      tier: agent.service_tier
    }, { preferCurrent: true });
    options.output?.log?.("  Source: installed agent, not yet in LFP override config.");
    const selectedModel = await promptForModel(rl, {
      agentName: agent.name,
      displayName: agent.name,
      current: agent.model ?? models[0],
      models,
      output: options.output,
      modelSelector: options.modelSelector
    });
    const selectedTier = await promptForServiceTier(rl, {
      agentName: agent.name,
      displayName: agent.name,
      current: agent.service_tier ?? "default",
      output: options.output,
      tierSelector: options.tierSelector
    });
    const selectedReasoning = await promptForReasoningEffort(rl, {
      agentName: agent.name,
      displayName: agent.name,
      current: agent.model_reasoning_effort ?? "medium",
      output: options.output,
      reasoningSelector: options.reasoningSelector
    });
    config.overrides[agent.name] = {
      model: selectedModel,
      service_tier: selectedTier,
      model_reasoning_effort: getCompatibleReasoningEffort(selectedModel, selectedReasoning)
    };
  }

  writeOverrideFields(configPath, config.overrides);
  if (options.persistUserOverrides !== false) saveUserOverrideConfig(configPath, userConfigPath);
  options.output?.log?.("OMO override model configuration written.\n");
  return config;
}

async function promptForModelSection(config, agentName, options) {
  const fields = config.overrides[agentName] ?? {};
  const current = typeof fields.model === "string" ? fields.model : options.models[0];
  const currentReasoning = typeof fields.model_reasoning_effort === "string" ? fields.model_reasoning_effort : "low";
  const currentTier = typeof fields.service_tier === "string" ? fields.service_tier : "default";
  const label = options.displayName ?? agentName;

  logAgentGuide(options.output, label, {
    model: current,
    reasoning: currentReasoning,
    tier: currentTier
  }, { preferCurrent: true });

  fields.model = await promptForModel(options.readline, {
    agentName,
    displayName: label,
    current,
    models: options.models,
    output: options.output,
    modelSelector: options.modelSelector
  });
  fields.service_tier = await promptForServiceTier(options.readline, {
    agentName,
    displayName: label,
    current: currentTier,
    output: options.output,
    tierSelector: options.tierSelector
  });
  fields.model_reasoning_effort = getCompatibleReasoningEffort(fields.model, await promptForReasoningEffort(options.readline, {
    agentName,
    displayName: label,
    current: currentReasoning,
    output: options.output,
    reasoningSelector: options.reasoningSelector
  }));
  config.overrides[agentName] = fields;
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

export const writeOverrideModels = writeOverrideFields;

async function maybeRestoreUserOverrideConfig(configPath, userConfigPath, options) {
  if (options.persistUserOverrides === false || !configPath.endsWith(".toml") || !hasSavedUserOverrideConfig(userConfigPath)) {
    return null;
  }

  const shouldAdjust = await promptForYesNo(
    options.readline,
    `  Adjust LFP model overrides now? Saved settings: ${userConfigPath} [y/N]: `,
    { yesNoSelector: options.yesNoSelector }
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

export { discoverAdditionalAgents, writeOverrideFields };
