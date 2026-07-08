import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getRetryGuidance,
  getRuntimeFallbackConfig,
  shouldRetryOnError
} from "../src/model/runtime-fallback-engine.js";

test("given runtime fallback config when loaded then has expected values", () => {
  const config = getRuntimeFallbackConfig();
  assert.ok(config);
  assert.ok(config.retry_on_errors.includes(429));
  assert.ok(config.retry_on_errors.includes(500));
  assert.equal(config.max_fallback_attempts, 3);
  assert.equal(config.cooldown_seconds, 30);
});

test("given 429 status when checking retry then returns true", () => {
  assert.equal(shouldRetryOnError(429), true);
});

test("given 200 status when checking retry then returns false", () => {
  assert.equal(shouldRetryOnError(200), false);
});

test("given 429 error when getting retry guidance then emits guidance with agent name", () => {
  const result = getRetryGuidance("oracle", 429);
  assert.equal(result.emit, true);
  assert.ok(result.guidance!.includes("oracle"));
  assert.ok(result.guidance!.includes("429"));
  assert.ok(result.guidance!.includes("retry"));
});

test("given 200 success when getting retry guidance then does not emit", () => {
  const result = getRetryGuidance("oracle", 200);
  assert.equal(result.emit, false);
});

test("given 500 error when checking retry then returns true", () => {
  assert.equal(shouldRetryOnError(500), true);
});

test("given 404 error when checking retry then returns false", () => {
  assert.equal(shouldRetryOnError(404), false);
});
