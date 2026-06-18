import {
  BACK_SELECTION,
  logAgentGuide,
  promptForModel,
  promptForReasoningEffort,
  promptForServiceTier,
  promptForYesNo
} from "./model-config-prompts.mjs";
import { getCompatibleReasoningEffort } from "./model-reasoning-compat.mjs";
import { getAgentDisplayName } from "./agent-model-metadata.mjs";
import { getPrimaryFields, getVanillaPrimaryFields, logAgentCurrentAndRecommendation, logSetupGuide, mergePrimary } from "./agent-model-config-fields.mjs";
import { logModelSettingScope } from "./model-setting-scopes.mjs";

export const DEFAULT_MODEL_SECTIONS = new Map([
  ["default", "Default Codex"],
  ["ulw", "ULW"]
]);

export async function runModelOverridePrompts(config, steps, options) {
  let stepIndex = 0;
  let printedAgentHeading = false;
  while (stepIndex < steps.length) {
    const step = steps[stepIndex];
    if (step.type === "agent" && printedAgentHeading === false) {
      options.output?.log?.("\n=== OMO Agent Model Overrides ===");
      options.output?.log?.("Choose models for existing non-art LazyCodex/OMO agents.");
      options.output?.log?.("Each agent prompt shows the agent name, current config, and selected fields.\n");
      printedAgentHeading = true;
    }
    const result = await runPromptStep(config, step, options);
    stepIndex = result === BACK_SELECTION ? Math.max(0, stepIndex - 1) : stepIndex + 1;
  }
}

async function runPromptStep(config, step, options) {
  if (step.type === "default") return promptForModelSection(config, step.agentName, {
    displayName: step.displayName,
    models: options.models,
    output: options.output,
    confirmConfiguredValues: options.confirmConfiguredValues,
    modelSelector: options.modelSelector,
    tierSelector: options.tierSelector,
    reasoningSelector: options.reasoningSelector,
    readline: options.readline
  });

  if (step.type === "agent") return promptForConfiguredAgent(config, step.agentName, {
    models: options.models,
    output: options.output,
    recommended: options.recommendations[step.agentName] ?? {},
    vanillaFields: options.installedAgentFields[step.agentName],
    confirmConfiguredValues: options.confirmConfiguredValues,
    modelSelector: options.modelSelector,
    tierSelector: options.tierSelector,
    reasoningSelector: options.reasoningSelector,
    readline: options.readline
  });

  return promptForAdditionalAgent(config, step.agent, {
    models: options.models,
    output: options.output,
    recommended: options.recommendations[step.agent.name] ?? {},
    confirmConfiguredValues: options.confirmConfiguredValues,
    modelSelector: options.modelSelector,
    tierSelector: options.tierSelector,
    reasoningSelector: options.reasoningSelector,
    yesNoSelector: options.yesNoSelector,
    readline: options.readline
  });
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

  let fieldIndex = 0;
  while (fieldIndex < 3) {
    if (fieldIndex === 0) {
      const model = await promptForModel(options.readline, {
        agentName,
        displayName: label,
        current: fields.model ?? current,
        models: options.models,
        output: options.output,
        modelSelector: options.modelSelector
      });
      if (model === BACK_SELECTION) return BACK_SELECTION;
      fields.model = model;
      fieldIndex += 1;
      continue;
    }

    if (fieldIndex === 1) {
      const tier = await promptForServiceTier(options.readline, {
        agentName,
        displayName: label,
        current: fields.service_tier ?? currentTier,
        output: options.output,
        tierSelector: options.tierSelector
      });
      if (tier === BACK_SELECTION) {
        fieldIndex -= 1;
        continue;
      }
      fields.service_tier = tier;
      fieldIndex += 1;
      continue;
    }

    const reasoning = await promptForReasoningEffort(options.readline, {
      agentName,
      displayName: label,
      current: fields.model_reasoning_effort ?? currentReasoning,
      output: options.output,
      reasoningSelector: options.reasoningSelector
    });
    if (reasoning === BACK_SELECTION) {
      fieldIndex -= 1;
      continue;
    }
    fields.model_reasoning_effort = getCompatibleReasoningEffort(fields.model, reasoning);
    fieldIndex += 1;
  }
  config.overrides[agentName] = fields;
  return null;
}

async function promptForConfiguredAgent(config, agentName, options) {
  const fields = config.overrides[agentName] ?? {};
  const result = await promptForAgentFields(fields, agentName, options);
  if (result === BACK_SELECTION) return BACK_SELECTION;
  config.overrides[agentName] = fields;
  return null;
}

async function promptForAdditionalAgent(config, agent, options) {
  while (true) {
    const shouldChange = await promptForYesNo(
      options.readline,
      `  Change ${agent.name} (current: ${agent.model ?? "unknown"}) model/tier/reasoning too? [y/N]: `,
      { yesNoSelector: options.yesNoSelector }
    );
    if (shouldChange === BACK_SELECTION) return BACK_SELECTION;
    if (!shouldChange) return null;

    logAgentCurrentAndRecommendation(options.output, agent.name, agent, options.recommended, null);
    options.output?.log?.("  Source: installed agent, not yet in LFP override config.");
    const fields = {};
    const result = await promptForAgentFields(fields, agent.name, {
      models: options.models,
      output: options.output,
      recommended: options.recommended,
      currentFields: agent,
      confirmConfiguredValues: options.confirmConfiguredValues,
      modelSelector: options.modelSelector,
      tierSelector: options.tierSelector,
      reasoningSelector: options.reasoningSelector,
      readline: options.readline,
      skipGuide: true
    });
    if (result === BACK_SELECTION) continue;
    config.overrides[agent.name] = fields;
    return null;
  }
}

async function promptForAgentFields(fields, agentName, options) {
  const currentFields = options.currentFields ?? fields;
  const current = getPrimaryFields(currentFields, options.models);
  const recommended = options.recommended ?? {};
  const vanilla = getVanillaPrimaryFields(options.vanillaFields);
  const displayName = getAgentDisplayName(agentName);
  const useConfiguredDefaults = options.confirmConfiguredValues === true;
  const defaultPrimary = useConfiguredDefaults ? current : mergePrimary(current, recommended);
  const draft = {};

  if (options.skipGuide !== true) {
    logModelSettingScope(options.output, agentName, displayName);
    logAgentCurrentAndRecommendation(options.output, agentName, currentFields, recommended, vanilla);
  }

  let fieldIndex = 0;
  while (fieldIndex < 3) {
    if (fieldIndex === 0) {
      const model = await promptForModel(options.readline, {
        agentName,
        displayName,
        current: draft.model ?? defaultPrimary.model,
        vanillaRecommendation: vanilla?.model,
        vanillaRecommendationFields: vanilla,
        recommendationFields: recommended,
        models: options.models,
        output: options.output,
        modelSelector: options.modelSelector
      });
      if (model === BACK_SELECTION) return BACK_SELECTION;
      draft.model = model;
      fieldIndex += 1;
      continue;
    }

    if (fieldIndex === 1) {
      const tier = await promptForServiceTier(options.readline, {
        agentName,
        displayName,
        current: draft.service_tier ?? defaultPrimary.service_tier,
        vanillaRecommendation: vanilla?.service_tier,
        vanillaRecommendationFields: vanilla,
        recommendationFields: recommended,
        output: options.output,
        tierSelector: options.tierSelector
      });
      if (tier === BACK_SELECTION) {
        fieldIndex -= 1;
        continue;
      }
      draft.service_tier = tier;
      fieldIndex += 1;
      continue;
    }

    const reasoning = await promptForReasoningEffort(options.readline, {
      agentName,
      displayName,
      current: draft.model_reasoning_effort ?? defaultPrimary.model_reasoning_effort,
      vanillaRecommendation: vanilla?.model_reasoning_effort,
      vanillaRecommendationFields: vanilla,
      recommendationFields: recommended,
      output: options.output,
      reasoningSelector: options.reasoningSelector
    });
    if (reasoning === BACK_SELECTION) {
      fieldIndex -= 1;
      continue;
    }
    draft.model_reasoning_effort = getCompatibleReasoningEffort(draft.model, reasoning);
    fieldIndex += 1;
  }
  fields.model = draft.model;
  fields.service_tier = draft.service_tier;
  fields.model_reasoning_effort = draft.model_reasoning_effort;
  return null;
}
