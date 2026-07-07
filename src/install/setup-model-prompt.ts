import { createInterface } from "node:readline";

import { configureAgentModelOverrides } from "../model/agent-model-config.js";
import { fetchAvailableModels } from "../model/model-provider.js";
import { buildRecommendedModelOverrides } from "../model/model-recommendations.js";
import { readOverrideConfig } from "../model/sync-agent-overrides.js";
import { hasSavedUserOverrideConfig, migrateLegacyUserOverrideConfig } from "../model/user-model-overrides.js";

export async function maybePromptModelOverrides(args, configPath, options = {}) {
  const userConfigPath = migrateLegacyUserOverrideConfig(options);
  const hasSavedOverrides = hasSavedUserOverrideConfig(userConfigPath);
  const shouldPromptModelOverrides =
    hasSavedOverrides || args.config === undefined || hasEditableOverrideConfig(configPath);
  if (!shouldPromptModelOverrides) return;

  const rl = options.readline ?? createInterface({ input: process.stdin, output: process.stdout });
  const output = options.output ?? console;
  const models = options.models ?? (await safeFetchSetupModels(options));
  if (models.length > 0) printSetupModelRecommendations(configPath, models, output, options);
  try {
    if (!hasSavedOverrides) {
      output.log("Showing default OMO/LazyCodex model guide. Press Enter to keep each shown value.");
      output.log("");
    }

    await configureAgentModelOverrides(configPath, {
      readline: rl,
      output,
      recommendModels: true,
      models,
      confirmConfiguredValues: true,
      modelSelector: options.modelSelector,
      tierSelector: options.tierSelector,
      reasoningSelector: options.reasoningSelector,
      yesNoSelector: options.yesNoSelector,
      env: options.env,
      userOverrideConfigPath: options.userOverrideConfigPath,
      persistUserOverrides: options.persistUserOverrides
    });
  } finally {
    if (!options.readline) rl.close();
  }
}

export async function safeFetchSetupModels(options) {
  try {
    return await fetchAvailableModels(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.output?.log?.(`Could not discover available models for recommendations: ${message}`);
    return [];
  }
}

function printSetupModelRecommendations(configPath, models, output, options) {
  const config = readOverrideConfig(configPath, options);
  const recommendations = buildRecommendedModelOverrides(config.overrides ?? {}, models, options);
  const entries = Object.entries(recommendations).filter(([, fields]) => typeof fields.model === "string");
  if (entries.length === 0) return;

  output.log("LFP model recommendations from the active provider:");
  for (const [agentName, fields] of entries) {
    const current = config.overrides?.[agentName] ?? {};
    output.log(
      `  ${agentName}: ${fields.model} (reasoning: ${fields.model_reasoning_effort ?? "N/A"}, tier: ${
        fields.service_tier ?? "default"
      }) from current ${current.model ?? "unset"}`
    );
  }
  output.log("");
}

function hasEditableOverrideConfig(configPath) {
  try {
    const config = readOverrideConfig(configPath);
    return Object.keys(config.overrides ?? {}).length > 0;
  } catch (error) {
    if (error instanceof Error) return false;
    throw error;
  }
}
