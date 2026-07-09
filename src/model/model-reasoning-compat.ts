const MODELS_WITHOUT_REASONING_EFFORT = [
  /^glm[-_.]/i,
  /\/glm[-_.]/i,
  /^gemini[-_.]/i,
  /\/gemini[-_.]/i,
  /(?:^|[-_.])non[-_.]?reasoning(?:[-_.]|$)/i,
  /^grok-(?:build|code-fast|composer)(?:[-_.]|$)/i,
  /\/grok-(?:build|code-fast|composer)(?:[-_.]|$)/i
];
const MODELS_WITH_SERVICE_TIER = [/(?:^|\/)(?:gpt|codex)(?:[-_.]|$)/i];

export function getCompatibleReasoningEffort(model, reasoning) {
  if (MODELS_WITHOUT_REASONING_EFFORT.some((pattern) => pattern.test(model ?? ""))) {
    return null;
  }
  return reasoning;
}

export function getCompatibleServiceTier(model, tier) {
  if (MODELS_WITH_SERVICE_TIER.some((pattern) => pattern.test(model ?? ""))) {
    return tier;
  }
  return null;
}

export function getCompatibleModelFields(fields) {
  const compatible = {};
  if (typeof fields.model === "string") compatible.model = fields.model;
  const model = compatible.model;
  if (typeof fields.model_reasoning_effort === "string") {
    const reasoning = getCompatibleReasoningEffort(model, fields.model_reasoning_effort);
    if (reasoning !== null) compatible.model_reasoning_effort = reasoning;
  }
  if (typeof fields.service_tier === "string") {
    const tier = getCompatibleServiceTier(model, fields.service_tier);
    if (tier !== null) compatible.service_tier = tier;
  }
  return compatible;
}
