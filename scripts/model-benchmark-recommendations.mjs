import { recommendRoleModelFields } from "./model-recommendations.mjs";

const RECOMMENDATION_FIELDS = [
  "model",
  "model_reasoning_effort",
  "service_tier"
];

export function recommendFromAvailableModels({ roles, models, currentOverrides, env }) {
  const recommendations = {};
  for (const role of roles) {
    const fields = recommendRoleModelFields(role, models, { env });
    if (fields.model === undefined) continue;
    const candidate = scoreModel(fields.model, models.indexOf(fields.model));
    const current = currentOverrides[role] ?? {};
    recommendations[role] = {
      ...fields,
      benchmark: {
        routing_score: candidate.score,
        relative_rank_ms: candidate.relative_latency_ms,
        ok_rate: 1,
        source: "prebenchmarked-family-routing"
      },
      changed: RECOMMENDATION_FIELDS.some((field) => current[field] !== fields[field])
    };
  }
  return recommendations;
}

function scoreModel(model, rank) {
  const normalizedRank = rank >= 0 ? rank : 0;
  return {
    model,
    score: Math.max(0.7, 1 - normalizedRank * 0.05),
    relative_latency_ms: 1000 + normalizedRank * 250
  };
}
