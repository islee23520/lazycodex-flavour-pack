import { getCompatibleReasoningEffort } from "./model-reasoning-compat.mjs";

const ROLE_PROFILES = {
  explorer: {
    reasoning: "low",
    tier: "default",
    families: ["grok-3-mini-fast", "gpt-5.4-mini", "glm-5-turbo", "glm-5.1", "grok-3-mini"]
  },
  librarian: {
    reasoning: "medium",
    tier: "default",
    families: ["gpt-5.4-mini", "glm-5.2", "glm-5.1", "grok-3-mini-fast", "gpt-5.4"]
  },
  metis: {
    reasoning: "high",
    tier: "default",
    families: ["glm-5.2", "glm-5.1", "grok-4.20-0309-reasoning", "gpt-5.4", "gpt-5.5"]
  },
  plan: {
    reasoning: "xhigh",
    tier: "default",
    families: ["grok-4.20-0309-reasoning", "gpt-5.5", "gpt-5.4", "glm-5.2"]
  },
  momus: {
    reasoning: "xhigh",
    tier: "default",
    families: ["gpt-5.5", "grok-4.20-0309-reasoning", "gpt-5.4", "glm-5.2"]
  },
  "codex-ultrawork-reviewer": {
    reasoning: "high",
    tier: "default",
    families: ["gpt-5.5", "gpt-5.4", "grok-4.20-0309-reasoning", "gpt-5.3-codex-spark"]
  }
};

export function recommendFromAvailableModels({ roles, models, currentOverrides }) {
  const recommendations = {};
  for (const role of roles) {
    const profile = ROLE_PROFILES[role];
    if (profile === undefined) continue;
    const candidate = selectAvailableModel(profile.families, models);
    if (candidate === null) continue;
    const current = currentOverrides[role] ?? {};
    recommendations[role] = {
      model: candidate.model,
      model_reasoning_effort: getCompatibleReasoningEffort(candidate.model, profile.reasoning),
      service_tier: profile.tier,
      benchmark: {
        avg_score: candidate.score,
        avg_latency_ms: candidate.relative_latency_ms,
        ok_rate: 1,
        source: "prebenchmarked-family-routing"
      },
      changed:
        current.model !== candidate.model ||
        current.model_reasoning_effort !== getCompatibleReasoningEffort(candidate.model, profile.reasoning) ||
        current.service_tier !== profile.tier
    };
  }
  return recommendations;
}

function selectAvailableModel(families, models) {
  for (const family of families) {
    const exact = models.find((model) => model === family);
    if (exact !== undefined) return scoreModel(exact, families.indexOf(family));
    const prefixed = models.find((model) => model.startsWith(`${family}-`));
    if (prefixed !== undefined) return scoreModel(prefixed, families.indexOf(family));
  }
  return null;
}

function scoreModel(model, rank) {
  return {
    model,
    score: Math.max(0.7, 1 - rank * 0.05),
    relative_latency_ms: 1000 + rank * 250
  };
}
