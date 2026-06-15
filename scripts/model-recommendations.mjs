import { classifyModelInventory } from "./model-inventory.mjs";
import { getCompatibleReasoningEffort } from "./model-reasoning-compat.mjs";

const XHIGH_REASONING_AGENT_NAMES = new Set(["momus", "plan", "sisyphus"]);
const REASONING_AGENT_NAMES = new Set(["metis", "momus", "plan", "sisyphus", "ulw-plan", "review-work"]);

const ROLE_POLICIES = {
  explorer: rolePolicy("low", "default", [
    { id: "grok-3-mini-fast" },
    { family: "grok", capability: "fast" },
    { family: "gpt", capability: "fast" },
    { family: "glm", pattern: /(?:turbo|mini|fast|5\.1)/i },
    { family: "gpt" },
    { family: "glm" }
  ]),
  librarian: rolePolicy("medium", "default", [
    { family: "grok", capability: "fast" },
    { family: "gpt", capability: "fast" },
    { family: "glm" },
    { family: "gpt" }
  ]),
  metis: rolePolicy("high", "default", [
    { family: "glm", capability: "reasoning" },
    { family: "grok", capability: "reasoning" },
    { family: "gpt", capability: "reasoning", pattern: /^(?!.*mini).*$/i }
  ]),
  plan: rolePolicy("xhigh", "default", [
    { id: "grok-4.20-0309-reasoning" },
    { family: "grok", capability: "reasoning" },
    { family: "glm", capability: "reasoning" },
    { family: "gpt", capability: "reasoning", pattern: /^(?!.*mini).*$/i }
  ]),
  sisyphus: rolePolicy("xhigh", "default", [
    { id: "grok-4.20-0309-reasoning" },
    { family: "grok", capability: "reasoning" },
    { family: "glm", capability: "reasoning" },
    { family: "gpt", capability: "reasoning", pattern: /^(?!.*mini).*$/i }
  ]),
  momus: rolePolicy("xhigh", "default", [
    { id: "gpt-5.5" },
    { family: "gpt", capability: "reasoning", pattern: /^(?!.*mini).*$/i },
    { family: "grok", capability: "reasoning" },
    { family: "glm", capability: "reasoning" }
  ]),
  "codex-ultrawork-reviewer": rolePolicy("high", "default", [
    { id: "gpt-5.5" },
    { family: "gpt", capability: "reasoning", pattern: /^(?!.*codex-spark).*$/i },
    { family: "grok", capability: "reasoning" },
    { family: "glm", capability: "reasoning" }
  ])
};

for (const role of ["visual-engineering", "visual-looker", "artistry", "artistry-gen", "artistry-qa"]) {
  ROLE_POLICIES[role] = rolePolicy("high", "default", [
    { id: "gemini-pro-agent" },
    { family: "gemini", capability: "reasoning" },
    { family: "gemini", capability: "vision" },
    { family: "grok", capability: "reasoning" },
    { family: "gpt", capability: "reasoning", pattern: /^(?!.*mini).*$/i }
  ]);
}

export function buildRecommendedModelOverrides(overrides, models) {
  const recommendations = {};
  for (const agentName of Object.keys(overrides ?? {})) {
    recommendations[agentName] = recommendRoleModelFields(agentName, models);
  }
  return recommendations;
}

export function applyRecommendedModelOverrides(overrides, recommendations) {
  for (const [agentName, fields] of Object.entries(recommendations)) {
    overrides[agentName] = { ...(overrides[agentName] ?? {}), ...fields };
  }
}

export function recommendRoleModelFields(agentName, models) {
  const inventory = classifyModelInventory(models);
  const policy = ROLE_POLICIES[agentName] ?? legacyPolicy(agentName);
  const primary = selectPreferredModel(policy.primary, inventory);
  const selected = primary ?? inventory[0] ?? null;
  if (selected === null) return {};
  const model = selected.id;
  const recommendation = {
    model,
    model_reasoning_effort: getCompatibleReasoningEffort(model, policy.reasoning),
    service_tier: policy.tier
  };
  return recommendation;
}

function rolePolicy(reasoning, tier, primary) {
  return { reasoning, tier, primary };
}

function legacyPolicy(agentName) {
  const reasoningAgent = REASONING_AGENT_NAMES.has(agentName);
  let reasoning = "low";
  if (reasoningAgent) reasoning = "high";
  if (XHIGH_REASONING_AGENT_NAMES.has(agentName)) reasoning = "xhigh";
  return {
    reasoning,
    tier: reasoningAgent ? "default" : "fast",
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
