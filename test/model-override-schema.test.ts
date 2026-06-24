import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_NAME_PATTERN,
  parseModelOverrideConfig,
  parseSavedUserModelOverrideConfig
} from "../src/model/model-override-schema.ts";

test("given valid agent names when parsing then accepts", () => {
  const valid = {
    overrides: {
      explorer: { model: "gpt-5" },
      "codex-ultrawork-reviewer": { model: "grok-4" },
      "visual-engineering": { model: "gemini-2.5" }
    }
  };
  const result = parseModelOverrideConfig(valid);
  assert.equal(Object.keys(result.overrides).length, 3);
  assert.ok(AGENT_NAME_PATTERN.test("explorer"));
  assert.ok(AGENT_NAME_PATTERN.test("codex-ultrawork-reviewer"));
  assert.ok(AGENT_NAME_PATTERN.test("visual-engineering"));
});

test("given invalid agent names when parsing then rejects with clear error", () => {
  const invalidNames = ["../etc/passwd", "foo/bar", "agent.toml", "foo[bar]"];
  for (const name of invalidNames) {
    const bad = { overrides: { [name]: { model: "gpt-5" } } };
    assert.throws(
      () => parseModelOverrideConfig(bad),
      new RegExp(`Invalid agent name "${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`)
    );
    assert.throws(
      () => parseSavedUserModelOverrideConfig({ schemaVersion: 1, overrides: { [name]: { model: "gpt-5" } } }),
      new RegExp(`Invalid agent name "${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`)
    );
  }
});

test("given agent name with path separator when parsing then rejects", () => {
  const bad = { overrides: { "foo/bar": { model: "x" } } };
  assert.throws(() => parseModelOverrideConfig(bad), /Invalid agent name "foo\/bar"/);
});

test("given agent name with dotdot when parsing then rejects", () => {
  const bad = { overrides: { "../etc": { model: "x" } } };
  assert.throws(() => parseModelOverrideConfig(bad), /Invalid agent name "\.\.\/etc"/);
});
