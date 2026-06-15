const XHIGH_REASONING_AGENT_NAMES = new Set(["momus", "plan"]);
const REASONING_AGENT_NAMES = new Set(["metis", "momus", "plan", "ulw-plan", "review-work"]);

const UTILITY_MODEL_PATTERNS = [
  /gpt-5\.[0-9]+-mini/i,
  /gpt-5.*mini/i,
  /mini/i,
  /fast/i,
  /gpt-5\.[0-9]+/i,
  /gpt-5/i
];

const REASONING_MODEL_PATTERNS = [
  /gpt-5\.5/i,
  /gpt-5(?!.*mini)/i,
  /grok-4\.[0-9]+/i,
  /gemini.*pro/i,
  /claude.*opus/i
];

export function buildRecommendedModelOverrides(overrides, models) {
  const recommendations = {};
  for (const agentName of Object.keys(overrides ?? {})) {
    recommendations[agentName] = recommendAgentModelFields(agentName, models);
  }
  return recommendations;
}

export function applyRecommendedModelOverrides(overrides, recommendations) {
  for (const [agentName, fields] of Object.entries(recommendations)) {
    overrides[agentName] = { ...(overrides[agentName] ?? {}), ...fields };
  }
}

function recommendAgentModelFields(agentName, models) {
  const reasoningAgent = REASONING_AGENT_NAMES.has(agentName);
  let reasoningEffort = "low";
  if (reasoningAgent) reasoningEffort = "high";
  if (XHIGH_REASONING_AGENT_NAMES.has(agentName)) reasoningEffort = "xhigh";
  return {
    model: selectModel(models, reasoningAgent ? REASONING_MODEL_PATTERNS : UTILITY_MODEL_PATTERNS),
    model_reasoning_effort: reasoningEffort,
    service_tier: reasoningAgent ? "default" : "fast"
  };
}

function selectModel(models, patterns) {
  for (const pattern of patterns) {
    const match = models.find((model) => pattern.test(model));
    if (match !== undefined) return match;
  }
  return models[0];
}
