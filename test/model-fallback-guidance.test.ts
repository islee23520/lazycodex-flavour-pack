import assert from "node:assert/strict";
import { test } from "node:test";
import { runModelFallbackGuidance } from "../src/model/model-fallback-guidance.js";

test("given quota trigger prompt when guidance runs then mentions fallback chain", () => {
  const result = runModelFallbackGuidance({ prompt: "I got a quota error from the API" });
  assert.equal(result.emit, true);
  assert.ok(result.guidance.includes("fallback chain"), "guidance should mention fallback chain");
});

test("given non-trigger prompt when guidance runs then emits nothing", () => {
  const result = runModelFallbackGuidance({ prompt: "hello world random text" });
  assert.equal(result.emit, false);
});
