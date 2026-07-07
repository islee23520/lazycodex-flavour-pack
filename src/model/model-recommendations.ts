import { VIRTUAL_OVERRIDE_SECTIONS } from "./model-field-scope.js";
import { classifyModelInventory } from "./model-inventory.js";
import { getCompatibleModelFields } from "./model-reasoning-compat.js";
import { readRolePolicyConfig } from "./role-policy-config.js";

const XHIGH_REASONING_AGENT_NAMES = new Set([
  "momus",
  "plan",
  "lazycodex-code-reviewer",
  "lazycodex-gate-reviewer",
  "lazycodex-clone-fidelity-reviewer"
]);
const REASONING_AGENT_NAMES = new Set([
  "metis",
  "momus",
  "plan",
  "ulw-plan",
  "review-work",
  "lazycodex-executor",
  "lazycodex-code-reviewer",
  "lazycodex-qa-executor",
  "lazycodex-gate-reviewer",
  "lazycodex-clone-fidelity-reviewer"
]);

const DEEP_REASONING_PREFERENCES = [
  { family: "glm", capability: "reasoning" },
  { family: "gpt", capability: "reasoning", pattern: /^(?!.*mini).*$/i },
  { family: "grok", capability: "reasoning" },
  { family: "gemini", capability: "reasoning" }
];

const ROLE_MODEL_PREFERENCES = {
  explorer: {
    primary: [
      { id: "grok-3-mini-fast" },
      { family: "grok", capability: "fast" },
      { family: "gpt", capability: "fast" },
      { family: "glm", pattern: /(?:turbo|mini|fast|5\.1)/i },
      { family: "gpt" },
      { family: "glm" }
    ]
  },
  librarian: {
    primary: [
      { family: "grok", capability: "fast" },
      { family: "gpt", capability: "fast" },
      { family: "glm" },
      { family: "gpt" }
    ]
  },
  metis: {
    primary: [
      { family: "glm", capability: "reasoning" },
      { family: "grok", capability: "reasoning" },
      { family: "gpt", capability: "reasoning", pattern: /^(?!.*mini).*$/i }
    ]
  },
  plan: { primary: DEEP_REASONING_PREFERENCES },
  momus: {
    primary: [
      { id: "gpt-5.5" },
      { family: "gpt", capability: "reasoning", pattern: /^(?!.*mini).*$/i },
      { family: "grok", capability: "reasoning" },
      { family: "glm", capability: "reasoning" }
    ]
  },
  "lazycodex-executor": {
    primary: [
      { id: "gpt-5.5" },
      { family: "gpt", capability: "reasoning", pattern: /^(?!.*codex-spark).*$/i },
      { family: "grok", capability: "reasoning" },
      { family: "glm", capability: "reasoning" }
    ]
  },
  "lazycodex-code-reviewer": {
    primary: [
      { id: "gpt-5.5" },
      { family: "gpt", capability: "reasoning", pattern: /^(?!.*codex-spark).*$/i },
      { family: "grok", capability: "reasoning" },
      { family: "glm", capability: "reasoning" }
    ]
  },
  "lazycodex-qa-executor": {
    primary: [
      { id: "gpt-5.5" },
      { family: "gpt", capability: "reasoning", pattern: /^(?!.*codex-spark).*$/i },
      { family: "grok", capability: "reasoning" },
      { family: "glm", capability: "reasoning" }
    ]
  },
  "lazycodex-gate-reviewer": {
    primary: [
      { id: "gpt-5.5" },
      { family: "gpt", capability: "reasoning", pattern: /^(?!.*codex-spark).*$/i },
      { family: "grok", capability: "reasoning" },
      { family: "glm", capability: "reasoning" }
    ]
  },
  "lazycodex-clone-fidelity-reviewer": {
    primary: [
      { id: "gpt-5.5" },
      { family: "gpt", capability: "reasoning", pattern: /^(?!.*codex-spark).*$/i },
      { family: "grok", capability: "reasoning" },
      { family: "glm", capability: "reasoning" }
    ]
  }
};

export function buildRecommendedModelOverrides(overrides, models, options = {}) {
  const policyConfig = options.policyConfig ?? readRolePolicyConfig(options);
  const recommendations = {};
  for (const agentName of Object.keys(overrides ?? {})) {
    if (VIRTUAL_OVERRIDE_SECTIONS.has(agentName)) continue;
    recommendations[agentName] = recommendRoleModelFields(agentName, models, { ...options, policyConfig });
  }
  return recommendations;
}

export function applyRecommendedModelOverrides(overrides, recommendations) {
  for (const [agentName, fields] of Object.entries(recommendations)) {
    overrides[agentName] = { ...(overrides[agentName] ?? {}), ...fields };
  }
}

export function recommendRoleModelFields(agentName, models, options = {}) {
  const inventory = classifyModelInventory(models);
  const policyConfig = options.policyConfig ?? readRolePolicyConfig(options);
  const modelPreferences = ROLE_MODEL_PREFERENCES[agentName] ?? legacyModelPolicy(agentName);
  const fieldPolicy = getRoleFieldPolicy(agentName, policyConfig);
  const primary = selectPreferredModel(modelPreferences.primary, inventory);
  const selected = primary ?? inventory[0] ?? null;
  if (selected === null) return {};
  const model = selected.id;
  return getCompatibleModelFields({
    model,
    model_reasoning_effort: fieldPolicy.reasoning,
    service_tier: fieldPolicy.tier
  });
}

function getRoleFieldPolicy(agentName, policyConfig) {
  const configured = policyConfig.policies[agentName];
  const fallback = legacyFieldPolicy(agentName);
  return {
    reasoning: configured?.reasoning ?? fallback.reasoning,
    tier: configured?.tier ?? fallback.tier
  };
}

function legacyFieldPolicy(agentName) {
  const reasoningAgent = REASONING_AGENT_NAMES.has(agentName);
  let reasoning = "low";
  if (reasoningAgent) reasoning = "high";
  if (XHIGH_REASONING_AGENT_NAMES.has(agentName)) reasoning = "xhigh";
  return {
    reasoning,
    tier: reasoningAgent ? "default" : "fast"
  };
}

function legacyModelPolicy(agentName) {
  const reasoningAgent = REASONING_AGENT_NAMES.has(agentName);
  return {
    primary: reasoningAgent
      ? [
          { family: "gpt", capability: "reasoning", pattern: /^(?!.*mini).*$/i },
          { family: "grok", capability: "reasoning" },
          { family: "gemini", capability: "reasoning" },
          { family: "claude", capability: "reasoning" }
        ]
      : [
          { family: "gpt", capability: "fast" },
          { family: "grok", capability: "fast" },
          { capability: "fast" },
          { family: "gpt" }
        ]
  };
}

function selectPreferredModel(preferences, inventory) {
  for (const preference of preferences) {
    const match = inventory.find((model) => matchesPreference(model, preference));
    if (match !== undefined) return match;
  }
  return null;
}

function matchesPreference(model, preference) {
  if (preference.id !== undefined && model.id !== preference.id) return false;
  if (preference.family !== undefined && model.family !== preference.family) return false;
  if (preference.provider !== undefined && model.provider !== preference.provider) return false;
  if (preference.capability !== undefined && !model.capabilities.includes(preference.capability)) return false;
  if (preference.pattern !== undefined && !preference.pattern.test(model.id)) return false;
  return true;
}
