import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { resolve } from "../scripts/model-fallback-resolver.mjs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "lfp-resolver-test-"));
const ledgerDir = path.join(tmp, "lfp");
mkdirSync(ledgerDir, { recursive: true });
const ledgerFile = path.join(ledgerDir, "omo-agent-model-overrides.json");
writeFileSync(ledgerFile, `${JSON.stringify({
  schemaVersion: 1,
  overrides: {
    explorer: {
      model: "grok-4.3",
      model_reasoning_effort: "low",
      service_tier: "default",
      model_fallback: "gpt-5.4-mini",
      model_fallback_reasoning_effort: "low",
      model_fallback_service_tier: "default"
    },
    plan: {
      model: "gpt-5.5",
      model_reasoning_effort: "high",
      service_tier: "default",
      model_fallback: "gpt-5.5",
      model_fallback_reasoning_effort: "medium",
      model_fallback_service_tier: "default"
    }
  }
}, null, 2)}\n`);

describe("model-fallback-resolver", () => {
  it("returns primary when no error reason", () => {
    const r = resolve("explorer", { ledgerPath: ledgerFile });
    assert.equal(r.agent, "explorer");
    assert.equal(r.using_fallback, false);
    assert.equal(r.effective?.model, "grok-4.3");
    assert.equal(r.fallback_available, true);
  });

  it("switches to fallback on quota/rate/429/error", () => {
    const r = resolve("explorer", { ledgerPath: ledgerFile, onError: "quota" });
    assert.equal(r.using_fallback, true);
    assert.equal(r.effective?.model, "gpt-5.4-mini");
    assert.equal(r.reason, "quota");
  });

  it("given quota, rate, and 429 errors when resolving then uses fallback", () => {
    for (const onError of ["quota exceeded", "rate-limit", "HTTP 429"]) {
      const r = resolve("explorer", { ledgerPath: ledgerFile, onError });

      assert.equal(r.using_fallback, true);
      assert.equal(r.effective?.model, "gpt-5.4-mini");
    }
  });

  it("returns primary for agents without error trigger", () => {
    const r = resolve("plan", { ledgerPath: ledgerFile });
    assert.equal(r.using_fallback, false);
    assert.equal(r.effective?.model, "gpt-5.5");
  });

  it("reports no-entry for unknown agent", () => {
    const r = resolve("nonexistent-agent-xyz", { ledgerPath: ledgerFile });
    assert.equal(r.reason, "no-entry");
    assert.equal(r.primary, null);
  });

  it("given conflicting upstream agent TOML when resolving fallback then uses saved JSON", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "lfp-resolver-conflict-"));
    try {
      const lfpDir = path.join(root, "lfp");
      const agentsDir = path.join(root, "agents");
      mkdirSync(lfpDir, { recursive: true });
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(path.join(lfpDir, "omo-agent-model-overrides.json"), `${JSON.stringify({
        schemaVersion: 1,
        overrides: {
          explorer: {
            model: "primary",
            model_reasoning_effort: "low",
            service_tier: "default",
            model_fallback: "fallback",
            model_fallback_reasoning_effort: "low",
            model_fallback_service_tier: "default"
          }
        }
      })}\n`);
      writeFileSync(path.join(agentsDir, "explorer.toml"), 'name = "explorer"\nmodel_fallback = "wrong-upstream"\n');

      const r = resolve("explorer", { env: { CODEX_HOME: root }, onError: "quota" });

      assert.equal(r.using_fallback, true);
      assert.equal(r.effective?.model, "fallback");
      assert.equal(r.source, path.join(lfpDir, "omo-agent-model-overrides.json"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("given only upstream agent TOML when resolving then reports no-ledger", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "lfp-resolver-upstream-only-"));
    try {
      const agentsDir = path.join(root, "agents");
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(path.join(agentsDir, "explorer.toml"), 'name = "explorer"\nmodel = "primary"\nmodel_fallback = "wrong-upstream"\n');

      const r = resolve("explorer", { env: { CODEX_HOME: root }, onError: "quota" });

      assert.equal(r.reason, "no-ledger");
      assert.equal(r.using_fallback, false);
      assert.equal(r.effective, null);
      assert.equal(r.source, null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("given legacy override TOML when resolving fallback then uses override config", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "lfp-resolver-toml-"));
    try {
      const lfpDir = path.join(root, "lfp");
      mkdirSync(lfpDir, { recursive: true });
      const legacyLedger = path.join(lfpDir, "omo-agent-model-overrides.toml");
      writeFileSync(legacyLedger, [
        "[agents.explorer]",
        'model = "primary-toml"',
        'model_reasoning_effort = "low"',
        'service_tier = "default"',
        'model_fallback = "fallback-toml"',
        'model_fallback_reasoning_effort = "low"',
        'model_fallback_service_tier = "default"',
        ""
      ].join("\n"));

      const r = resolve("explorer", { env: { CODEX_HOME: root }, onError: "rate-limit" });

      assert.equal(r.using_fallback, true);
      assert.equal(r.primary?.model, "primary-toml");
      assert.equal(r.effective?.model, "fallback-toml");
      assert.equal(r.source, legacyLedger);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("given malformed saved JSON when resolving then reports parse-error", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "lfp-resolver-malformed-"));
    try {
      const lfpDir = path.join(root, "lfp");
      mkdirSync(lfpDir, { recursive: true });
      const malformedLedger = path.join(lfpDir, "omo-agent-model-overrides.json");
      writeFileSync(malformedLedger, '{"schemaVersion":1,"overrides":');

      const r = resolve("explorer", { ledgerPath: malformedLedger, onError: "quota" });

      assert.equal(r.reason, "parse-error");
      assert.equal(r.using_fallback, false);
      assert.equal(r.primary, null);
      assert.equal(r.fallback_available, false);
      assert.match(r.error, /SyntaxError/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
