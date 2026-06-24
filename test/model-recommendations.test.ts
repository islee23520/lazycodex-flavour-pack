import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { classifyModelInventory } from "../src/model/model-inventory.ts";
import { buildRecommendedModelOverrides } from "../src/model/model-recommendations.ts";
import { clearRolePolicyConfigCache } from "../src/model/role-policy-config.ts";

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

test("given CLIPROXY-like inventory when recommending role models then recommends primary role models only", () => {
  const recommendations = buildRecommendedModelOverrides(
    {
      explorer: {},
      metis: {},
      plan: {},
      momus: {}
    },
    ["glm-5.2", "grok-4.20-0309-reasoning", "grok-3-mini-fast", "gemini-pro-agent", "gpt-5.5"]
  );

  assert.equal(recommendations.explorer.model, "grok-3-mini-fast");
  assert.equal(recommendations.explorer.service_tier, "fast");
  assert.equal("model_fallback" in recommendations.explorer, false);

  assert.equal(recommendations.metis.model, "glm-5.2");
  assert.equal("model_reasoning_effort" in recommendations.metis, false);
  assert.equal("model_fallback" in recommendations.metis, false);

  assert.equal(recommendations.plan.model, "glm-5.2");
  assert.equal("model_fallback" in recommendations.plan, false);
  assert.equal("model_fallback" in recommendations.momus, false);
});

test("given explorer utility inventory when recommending role models then returns primary only", () => {
  const recommendations = buildRecommendedModelOverrides(
    {
      explorer: {}
    },
    ["glm-5-turbo", "grok-3-mini-fast", "gpt-5.5"]
  );

  assert.equal(recommendations.explorer.model, "grok-3-mini-fast");
  assert.equal("model_fallback" in recommendations.explorer, false);
});

test("given malformed-only model ids when recommending role models then omits invalid model fields", () => {
  const recommendations = buildRecommendedModelOverrides(
    {
      explorer: {}
    },
    ["", "  ", null, {}]
  );

  assert.deepEqual(recommendations.explorer, {});
});

test("given only one usable model when recommending role models then does not force fallback fields", () => {
  const recommendations = buildRecommendedModelOverrides(
    {
      explorer: {}
    },
    ["grok-3-mini-fast"]
  );

  assert.equal(recommendations.explorer.model, "grok-3-mini-fast");
  assert.equal("model_fallback" in recommendations.explorer, false);
  assert.equal("model_fallback_reasoning_effort" in recommendations.explorer, false);
  assert.equal("model_fallback_service_tier" in recommendations.explorer, false);
});

test("given user role policy when recommending role models then uses configured reasoning and tier", () => {
  const codexHome = mkdtempSync(path.join(os.tmpdir(), "lfp-role-policy-"));
  try {
    mkdirSync(path.join(codexHome, "lfp"), { recursive: true });
    writeFileSync(
      path.join(codexHome, "lfp", "lfp-role-policies.toml"),
      '[policies.explorer]\nreasoning = "medium"\ntier = "default"\n'
    );
    clearRolePolicyConfigCache();

    const recommendations = buildRecommendedModelOverrides({ explorer: {} }, ["grok-3-mini-fast", "gpt-5.5"], {
      env: { CODEX_HOME: codexHome }
    });

    assert.equal(recommendations.explorer.model, "grok-3-mini-fast");
    assert.equal(recommendations.explorer.model_reasoning_effort, "medium");
    assert.equal(recommendations.explorer.service_tier, "default");
  } finally {
    clearRolePolicyConfigCache();
    rmSync(codexHome, { recursive: true, force: true });
  }
});

test("given user xhigh role policy for GLM when recommending role models then downgrades incompatible reasoning", () => {
  const codexHome = mkdtempSync(path.join(os.tmpdir(), "lfp-role-policy-"));
  try {
    mkdirSync(path.join(codexHome, "lfp"), { recursive: true });
    writeFileSync(path.join(codexHome, "lfp", "lfp-role-policies.toml"), '[policies.metis]\nreasoning = "xhigh"\n');
    clearRolePolicyConfigCache();

    const recommendations = buildRecommendedModelOverrides({ metis: {} }, ["glm-5.2", "gpt-5.5"], {
      env: { CODEX_HOME: codexHome }
    });

    assert.equal(recommendations.metis.model, "glm-5.2");
    assert.equal("model_reasoning_effort" in recommendations.metis, false);
    assert.equal(recommendations.metis.service_tier, "default");
  } finally {
    clearRolePolicyConfigCache();
    rmSync(codexHome, { recursive: true, force: true });
  }
});

test("given CLIPROXY-like model ids when classifying inventory then reports stable families providers and capabilities", () => {
  const inventory = classifyModelInventory([
    "glm-5.2",
    "grok-4.20-0309-reasoning",
    "grok-3-mini-fast",
    "gemini-pro-agent",
    "gpt-5.5",
    "unknown-local-model"
  ]);

  assert.deepEqual(
    inventory.map((model) => ({
      id: model.id,
      provider: model.provider,
      family: model.family,
      capabilities: model.capabilities
    })),
    [
      { id: "gemini-pro-agent", provider: "google", family: "gemini", capabilities: ["reasoning", "general"] },
      { id: "glm-5.2", provider: "zai", family: "glm", capabilities: ["reasoning", "general"] },
      { id: "gpt-5.5", provider: "openai", family: "gpt", capabilities: ["reasoning", "general"] },
      { id: "grok-3-mini-fast", provider: "xai", family: "grok", capabilities: ["fast", "general"] },
      { id: "grok-4.20-0309-reasoning", provider: "xai", family: "grok", capabilities: ["reasoning", "general"] },
      { id: "unknown-local-model", provider: "custom", family: "custom", capabilities: ["general"] }
    ]
  );
});

test("given malformed and empty model ids when classifying inventory then keeps usable unknown ids only", () => {
  const inventory = classifyModelInventory(["", "  ", null, {}, "unknown/"]);

  assert.deepEqual(inventory, [
    {
      id: "unknown/",
      provider: "custom",
      family: "custom",
      capabilities: ["general"]
    }
  ]);
});
