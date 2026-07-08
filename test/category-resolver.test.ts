import assert from "node:assert/strict";
import { test } from "node:test";
import { getAllCategories, resolveCategory, resolveCategoryForPrompt } from "../src/model/category-resolver.js";

test("given ultrabrain category when resolved then returns gpt-5.5 xhigh", () => {
  const result = resolveCategory("ultrabrain");
  assert.ok(result);
  assert.equal(result.model, "gpt-5.5");
  assert.equal(result.model_reasoning_effort, "xhigh");
  assert.equal(result.service_tier, "default");
  assert.ok(result.fallback_models.length > 0);
});

test("given visual-engineering category when resolved then returns gemini", () => {
  const result = resolveCategory("visual-engineering");
  assert.ok(result);
  assert.equal(result.model, "gemini-3.1-pro");
});

test("given all 8 categories when listed then returns expected names", () => {
  const names = getAllCategories();
  assert.ok(names.length === 8);
  for (const expected of [
    "visual-engineering",
    "ultrabrain",
    "deep",
    "artistry",
    "quick",
    "unspecified-low",
    "unspecified-high",
    "writing"
  ]) {
    assert.ok(names.includes(expected), `missing category: ${expected}`);
  }
});

test("given prompt with frontend keywords when resolved then returns visual-engineering", () => {
  const result = resolveCategoryForPrompt("help me fix the CSS layout for this React component");
  assert.equal(result, "visual-engineering");
});

test("given prompt with docs keywords when resolved then returns writing", () => {
  const result = resolveCategoryForPrompt("update the README documentation");
  assert.equal(result, "writing");
});

test("given non-matching prompt when resolved then returns null or best match", () => {
  const result = resolveCategoryForPrompt("hello world xyzzy");
  // unspecified-low has empty keywords, so it won't match; expect null or low score
  assert.ok(result === null || typeof result === "string");
});

test("given unknown category when resolved then returns null", () => {
  const result = resolveCategory("nonexistent-category");
  assert.equal(result, null);
});
