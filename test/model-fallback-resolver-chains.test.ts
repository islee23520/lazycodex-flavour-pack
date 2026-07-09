import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCategoryFallbackChain, resolveFallbackChain } from "../src/model/model-fallback-resolver.js";

test("given removed LFP-owned agent when resolving fallback chain then returns empty array", () => {
  for (const agentName of ["oracle", "prometheus", "hephaestus", "atlas", "sisyphus-junior"]) {
    assert.deepEqual(resolveFallbackChain(agentName), [], `${agentName} chain should be removed`);
  }
});

test("given unknown agent when resolving fallback chain then returns empty array", () => {
  const chain = resolveFallbackChain("nonexistent");
  assert.deepEqual(chain, []);
});

test("given ultrabrain category when resolving fallback chain then returns ordered array", () => {
  const chain = resolveCategoryFallbackChain("ultrabrain");
  assert.ok(chain.length > 1);
  assert.ok(chain.includes("gemini-3.1-pro"));
});
