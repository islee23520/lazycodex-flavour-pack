import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCategoryFallbackChain, resolveFallbackChain } from "../src/model/model-fallback-resolver.js";

test("given oracle agent when resolving fallback chain then returns ordered array", () => {
  const chain = resolveFallbackChain("oracle");
  assert.ok(chain.length > 1, `oracle chain should have > 1 models, got ${chain.length}`);
  assert.ok(chain.includes("gemini-3.1-pro"));
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
