import { logAgentGuide } from "./model-config-prompts.mjs";
import { getAgentDescription, getAgentDisplayName } from "./agent-model-metadata.mjs";
import { formatPrimaryFields, getModelSetupGuide } from "./model-setup-guidance.mjs";

export function getPrimaryFields(fields, models) {
  return {
    model: typeof fields.model === "string" ? fields.model : models[0],
    model_reasoning_effort: typeof fields.model_reasoning_effort === "string" ? fields.model_reasoning_effort : "low",
    service_tier: typeof fields.service_tier === "string" ? fields.service_tier : "default"
  };
}

export function mergePrimary(current, recommended) {
  return {
    model: recommended.model ?? current.model,
    model_reasoning_effort: recommended.model_reasoning_effort ?? current.model_reasoning_effort,
    service_tier: recommended.service_tier ?? current.service_tier
  };
}

export function getVanillaPrimaryFields(fields) {
  if (fields === null || typeof fields !== "object" || typeof fields.model !== "string") return null;
  return {
    model: fields.model,
    model_reasoning_effort: typeof fields.model_reasoning_effort === "string" ? fields.model_reasoning_effort : undefined,
    service_tier: typeof fields.service_tier === "string" ? fields.service_tier : undefined
  };
}

export function logAgentCurrentAndRecommendation(output, agentName, currentFields, recommendation, vanilla) {
  const current = getPrimaryFields(currentFields, []);
  const displayName = getAgentDisplayName(agentName);
  const description = getAgentDescription(agentName);
  if (description) output?.log?.(`Role: ${description}`);
  logSetupGuide(output, agentName);
  logAgentGuide(output, displayName, {
    model: current.model,
    reasoning: current.model_reasoning_effort,
    tier: current.service_tier
  }, { preferCurrent: true });
  if (vanilla?.model) {
    output?.log?.(`  Vanilla LazyCodex recommendation: ${formatPrimaryFields(vanilla)}`);
  }
  output?.log?.(
    `  Original/current: ${current.model ?? "unknown"} (reasoning: ${current.model_reasoning_effort}, tier: ${current.service_tier})`
  );
  if (recommendation.model) {
    output?.log?.(`  LFP recommendation: ${formatPrimaryFields(recommendation)}`);
  }
}

export function logSetupGuide(output, agentName) {
  const guide = getModelSetupGuide(agentName);
  output?.log?.(`  Role guide: ${guide.role}`);
  output?.log?.(`  Tune for: ${guide.tuneFor}`);
  output?.log?.(`  Minimum capability: ${guide.minimum}`);
}
