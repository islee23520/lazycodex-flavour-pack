import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { applyRecommendedOverrides } from "../scripts/model-benchmark-overrides.mjs";
import { resolve } from "../scripts/model-fallback-resolver.mjs";
import { syncAgentOverrides } from "../scripts/sync-agent-overrides.mjs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "lfp-resolver-test-"));
const ledgerDir = tmp;
mkdirSync(ledgerDir, { recursive: true });
const ledgerFile = path.join(ledgerDir, "lfp.json");
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
      const agentsDir = path.join(root, "agents");
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(path.join(root, "lfp.json"), `${JSON.stringify({
        schemaVersion: 2,
        source: { agentsDir: "${CODEX_HOME}/agents" },
        overrides: {
          explorer: {
            model: "primary",
            model_reasoning_effort: "low",
            service_tier: "default",
            model_fallback: "fallback",
            model_fallback_reasoning_effort: "low",
            model_fallback_service_tier: "default"
          }
        },
        rolePolicies: {}
      })}\n`);
      writeFileSync(path.join(agentsDir, "explorer.toml"), 'name = "explorer"\nmodel_fallback = "wrong-upstream"\n');

      const r = resolve("explorer", { env: { CODEX_HOME: root }, onError: "quota" });

      assert.equal(r.using_fallback, true);
      assert.equal(r.effective?.model, "fallback");
      assert.equal(r.source, path.join(root, "lfp.json"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("given benchmark applier writes saved upstream overrides and sync skips installed TOML when resolving then keeps primary-only saved JSON", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "lfp-resolver-applier-topology-"));
    try {
      const codexHome = path.join(root, "codex-home");
      const agentsDir = path.join(codexHome, "agents");
      const configPath = path.join(root, "overrides.toml");
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(
        path.join(agentsDir, "explorer.toml"),
        [
          'name = "explorer"',
          'model = "old-primary"',
          'model_fallback = "old-installed-fallback"',
          ""
        ].join("\n")
      );
      writeFileSync(
        configPath,
        [
          "[source]",
          'agents_dir = "${CODEX_HOME}/agents"',
          "",
          "[agents.explorer]",
          'model = "old-primary"',
          'model_fallback = "old-saved-fallback"',
          ""
        ].join("\n")
      );

      const applied = applyRecommendedOverrides(
        { overrides: { explorer: { model: "old-primary", model_fallback: "old-saved-fallback" } } },
        {
          explorer: {
            changed: true,
            model: "saved-primary",
            model_reasoning_effort: "low",
            service_tier: "default"
          }
        },
        { CODEX_HOME: codexHome }
      );
      const savedPath = path.join(codexHome, "lfp.json");
      const syncResult = syncAgentOverrides(savedPath, {
        env: { ...process.env, CODEX_HOME: codexHome },
        sourceAgentsDir: agentsDir
      });
      writeFileSync(
        path.join(agentsDir, "explorer.toml"),
        readFileSync(path.join(agentsDir, "explorer.toml"), "utf8")
          .replace('model = "saved-primary"', 'model = "conflicting-installed-primary"')
      );

      const resolved = resolve("explorer", { env: { ...process.env, CODEX_HOME: codexHome }, onError: "quota" });
      const saved = JSON.parse(readFileSync(savedPath, "utf8"));
      const installed = readFileSync(path.join(agentsDir, "explorer.toml"), "utf8");

      assert.deepEqual(applied, ["explorer"]);
      assert.deepEqual(syncResult.changed, []);
      assert.deepEqual(syncResult.skippedReadOnly, ["explorer"]);
      assert.equal("model_fallback" in saved.overrides.explorer, false);
      assert.match(installed, /^model_fallback = "old-installed-fallback"$/m);
      assert.equal(resolved.using_fallback, false);
      assert.equal(resolved.effective?.model, "saved-primary");
      assert.equal(resolved.source, savedPath);
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
      const malformedLedger = path.join(root, "lfp.json");
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
