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
import { discoverAdditionalAgents, readInstalledAgentFields, writeOverrideFields } from "./agent-model-config-io.mjs";
import { getAgentDisplayName, isLfpOwnedAgent } from "./agent-model-metadata.mjs";
import { getPrimaryFields, getVanillaPrimaryFields, logAgentCurrentAndRecommendation, logSetupGuide, mergePrimary } from "./agent-model-config-fields.mjs";
import { logModelSettingScope } from "./model-setting-scopes.mjs";

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
  const installedAgentFields = Object.fromEntries(
    agentNames
      .filter((agentName) => !isLfpOwnedAgent(agentName))
      .map((agentName) => [agentName, readInstalledAgentFields(config.source?.agentsDir, agentName)])
      .filter(([, fields]) => fields !== null)
  );
  if (defaultModelNames.length === 0 && agentNames.length === 0 && additionalAgents.length === 0) return config;

  const models = options.models ?? (await safeFetchAvailableModels(options));
  if (models.length === 0) {
    options.output?.log?.("No available models were discovered; enter model IDs manually.");
  }

  if (models.length > 0) printModelChoices(models, options.output);

  const recommendationTargets = {
    ...(config.overrides ?? {}),
    ...Object.fromEntries(additionalAgents.map((agent) => [agent.name, {}]))
  };
  const recommendations =
    (options.recommendModels === true || options.offerAutoRecommend === true) && models.length > 0
      ? buildRecommendedModelOverrides(recommendationTargets, models, options)
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
    await promptForAgentFields(fields, agentName, {
      models,
      output: options.output,
      recommended,
      vanillaFields: installedAgentFields[agentName],
      confirmConfiguredValues: options.confirmConfiguredValues,
      modelSelector: options.modelSelector,
      tierSelector: options.tierSelector,
      reasoningSelector: options.reasoningSelector,
      readline: rl
    });
    config.overrides[agentName] = fields;
  }

  for (const agent of additionalAgents) {
    const shouldChange = await promptForYesNo(
      rl,
      `  Change ${agent.name} (current: ${agent.model ?? "unknown"}) model/tier/reasoning too? [y/N]: `,
      { yesNoSelector: options.yesNoSelector }
    );
    if (!shouldChange) continue;

    const recommended = recommendations[agent.name] ?? {};
    logAgentCurrentAndRecommendation(options.output, agent.name, agent, recommended, null);
    options.output?.log?.("  Source: installed agent, not yet in LFP override config.");
    const fields = {};
    await promptForAgentFields(fields, agent.name, {
      models,
      output: options.output,
      recommended,
      currentFields: agent,
      confirmConfiguredValues: options.confirmConfiguredValues,
      modelSelector: options.modelSelector,
      tierSelector: options.tierSelector,
      reasoningSelector: options.reasoningSelector,
      readline: rl,
      skipGuide: true
    });
    config.overrides[agent.name] = fields;
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

  logModelSettingScope(options.output, agentName, label);
  logSetupGuide(options.output, agentName);
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

async function promptForAgentFields(fields, agentName, options) {
  const currentFields = options.currentFields ?? fields;
  const current = getPrimaryFields(currentFields, options.models);
  const recommended = options.recommended ?? {};
  const vanilla = getVanillaPrimaryFields(options.vanillaFields);
  const displayName = getAgentDisplayName(agentName);
  const useConfiguredDefaults = options.confirmConfiguredValues === true;
  const defaultPrimary = useConfiguredDefaults ? current : mergePrimary(current, recommended);

  if (options.skipGuide !== true) {
    logModelSettingScope(options.output, agentName, displayName);
    logAgentCurrentAndRecommendation(options.output, agentName, currentFields, recommended, vanilla);
  }

  fields.model = await promptForModel(options.readline, {
    agentName,
    displayName,
    current: defaultPrimary.model,
    vanillaRecommendation: vanilla?.model,
    vanillaRecommendationFields: vanilla,
    recommendationFields: recommended,
    models: options.models,
    output: options.output,
    modelSelector: options.modelSelector
  });
  fields.service_tier = await promptForServiceTier(options.readline, {
    agentName,
    displayName,
    current: defaultPrimary.service_tier,
    vanillaRecommendation: vanilla?.service_tier,
    vanillaRecommendationFields: vanilla,
    recommendationFields: recommended,
    output: options.output,
    tierSelector: options.tierSelector
  });
  fields.model_reasoning_effort = getCompatibleReasoningEffort(fields.model, await promptForReasoningEffort(options.readline, {
    agentName,
    displayName,
    current: defaultPrimary.model_reasoning_effort,
    vanillaRecommendation: vanilla?.model_reasoning_effort,
    vanillaRecommendationFields: vanilla,
    recommendationFields: recommended,
    output: options.output,
    reasoningSelector: options.reasoningSelector
  }));
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

export { discoverAdditionalAgents, writeOverrideFields };
