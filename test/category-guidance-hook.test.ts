import assert from "node:assert/strict";
import { test } from "node:test";
import { runCategoryGuidance } from "../src/hooks/category-guidance-hook.js";

test("given prompt with frontend keywords when category guidance runs then emits visual-engineering", () => {
  const result = runCategoryGuidance({ prompt: "help me fix the CSS layout for this React component" });
  assert.equal(result.emit, true);
  assert.ok(result.guidance.includes("visual-engineering"));
  assert.ok(result.guidance.includes("gemini-3.1-pro"));
});

test("given prompt with docs keywords when category guidance runs then emits writing", () => {
  const result = runCategoryGuidance({ prompt: "update the README documentation for this project" });
  assert.equal(result.emit, true);
  assert.ok(result.guidance.includes("writing"));
});

test("given prompt with algorithm keywords when category guidance runs then emits ultrabrain", () => {
  const result = runCategoryGuidance({ prompt: "I need help with a complex algorithm optimization" });
  assert.equal(result.emit, true);
  assert.ok(result.guidance.includes("ultrabrain"));
});

test("given non-matching prompt when category guidance runs then emits nothing", () => {
  const result = runCategoryGuidance({ prompt: "hello world xyzzy random text" });
  assert.equal(result.emit, false);
});

test("given empty prompt when category guidance runs then emits nothing", () => {
  const result = runCategoryGuidance({ prompt: "" });
  assert.equal(result.emit, false);
  assert.equal(result.reason, "no-text");
});

test("given null input when category guidance runs then emits nothing", () => {
  const result = runCategoryGuidance();
  assert.equal(result.emit, false);
});

test("given prompt already containing guidance marker when category guidance runs then emits nothing", () => {
  const result = runCategoryGuidance({ prompt: "<lfp-category-routing-guidance>already here" });
  assert.equal(result.emit, false);
  assert.equal(result.reason, "already-present");
});
