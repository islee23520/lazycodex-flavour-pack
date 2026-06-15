import test from "node:test";
import assert from "node:assert/strict";

import { buildRecommendedModelOverrides } from "../scripts/model-recommendations.mjs";

test("given OMO xhigh agents when recommending models then preserves upstream xhigh reasoning", () => {
  const recommendations = buildRecommendedModelOverrides(
    {
      plan: {
        model: "gpt-5.5",
        model_reasoning_effort: "xhigh",
        service_tier: "default"
      },
      momus: {
        model: "gpt-5.5",
        model_reasoning_effort: "xhigh",
        service_tier: "default"
      }
    },
    ["gpt-5.5", "gpt-5.4-mini"]
  );

  assert.equal(recommendations.plan.model, "gpt-5.5");
  assert.equal(recommendations.plan.model_reasoning_effort, "xhigh");
  assert.equal(recommendations.plan.service_tier, "default");
  assert.equal(recommendations.momus.model, "gpt-5.5");
  assert.equal(recommendations.momus.model_reasoning_effort, "xhigh");
  assert.equal(recommendations.momus.service_tier, "default");
});
