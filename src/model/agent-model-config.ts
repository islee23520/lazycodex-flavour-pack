import { DEFAULT_MODEL_SECTIONS, runModelOverridePrompts } from "./agent-model-config-flow.js";
import { discoverAdditionalAgents, readInstalledAgentFields, writeOverrideFields } from "./agent-model-config-io.js";
import { isLfpOwnedAgent } from "./agent-model-metadata.js";
import { BACK_SELECTION, printModelChoices, promptForYesNo } from "./model-config-prompts.js";
import { fetchAvailableModels } from "./model-provider.js";
import { buildRecommendedModelOverrides } from "./model-recommendations.js";
import { readOverrideConfig } from "./sync-agent-overrides.js";
import {
  getUserOverrideConfigPath,
  hasSavedUserOverrideConfig,
  migrateLegacyUserOverrideConfig,
  restoreUserOverrideConfig,
  saveUserOverrideConfig
} from "./user-model-overrides.js";

export { fetchAvailableModels, normalizeModelsPayload, readActiveModelProvider } from "./model-provider.js";
export { getUserOverrideConfigPath };

export async function configureAgentModelOverrides(configPath, options = {}) {
  if (options.interactive === false) return readOverrideConfig(configPath, options);

  const rl = options.readline;
  if (rl === undefined) throw new TypeError("readline is required for interactive model override configuration");

  const userConfigPath = migrateLegacyUserOverrideConfig(options);

  const savedOverrideChoice = await maybeRestoreUserOverrideConfig(configPath, userConfigPath, {
    ...options,
    readline: rl
  });
  if (savedOverrideChoice === "keep") return readOverrideConfig(configPath, options);
  if (savedOverrideChoice === "adjust") options.output?.log?.("Continuing with editable model override prompts.\n");

  const config = readOverrideConfig(configPath, options);
  const defaultModelNames = Object.keys(config.overrides ?? {}).filter((name) => DEFAULT_MODEL_SECTIONS.has(name));
  const agentNames = Object.keys(config.overrides ?? {}).filter((name) => !DEFAULT_MODEL_SECTIONS.has(name));
  const additionalAgents =
    options.additionalAgents ?? discoverAdditionalAgents(config.source?.agentsDir, config.overrides ?? {});
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

  const configuredSteps = [
    ...defaultModelNames.map((agentName) => ({
      type: "default",
      agentName,
      displayName: DEFAULT_MODEL_SECTIONS.get(agentName)
    })),
    ...agentNames.map((agentName) => ({
      type: "agent",
      agentName
    })),
    ...additionalAgents.map((agent) => ({
      type: "additional",
      agent
    }))
  ];

  await runModelOverridePrompts(config, configuredSteps, {
    models,
    output: options.output,
    recommendations,
    installedAgentFields,
    confirmConfiguredValues: options.confirmConfiguredValues,
    modelSelector: options.modelSelector,
    tierSelector: options.tierSelector,
    reasoningSelector: options.reasoningSelector,
    yesNoSelector: options.yesNoSelector,
    readline: rl
  });

  writeOverrideFields(configPath, config.overrides);
  if (options.persistUserOverrides !== false) saveUserOverrideConfig(configPath, userConfigPath);
  options.output?.log?.("OMO override model configuration written.\n");
  return config;
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
  if (
    options.persistUserOverrides === false ||
    !configPath.endsWith(".toml") ||
    !hasSavedUserOverrideConfig(userConfigPath)
  ) {
    return null;
  }

  const shouldAdjust = await promptForYesNo(
    options.readline,
    `  Adjust LFP model overrides now? Saved settings: ${userConfigPath} [y/N]: `,
    { yesNoSelector: options.yesNoSelector }
  );
  if (shouldAdjust === BACK_SELECTION) return null;
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
