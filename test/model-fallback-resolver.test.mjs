import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { resolve } from "../scripts/model-fallback-resolver.mjs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "lfp-resolver-test-"));
const ledgerDir = path.join(tmp, ".ledger", "lfp");
mkdirSync(ledgerDir, { recursive: true });
const ledgerFile = path.join(ledgerDir, "omo-agent-model-overrides.toml");
writeFileSync(ledgerFile, `
[source]
agents_dir = "\${CODEX_HOME}/agents"

[agents.explorer]
model = "grok-4.3"
model_reasoning_effort = "low"
service_tier = "default"
model_fallback = "gpt-5.4-mini"
model_fallback_reasoning_effort = "low"
model_fallback_service_tier = "default"

[agents.plan]
model = "gpt-5.5"
model_reasoning_effort = "high"
service_tier = "default"
model_fallback = "gpt-5.5"
model_fallback_reasoning_effort = "medium"
model_fallback_service_tier = "default"
`);

describe("model-fallback-resolver", () => {
  it("returns primary when no error reason", () => {
    const r = resolve("explorer", { ledgerPath: ledgerFile });
    assert.equal(r.agent, "explorer");
    assert.equal(r.using_fallback, false);
    assert.equal(r.effective.model, "grok-4.3");
    assert.equal(r.fallback_available, true);
  });

  it("switches to fallback on quota/rate/429/error", () => {
    const r = resolve("explorer", { ledgerPath: ledgerFile, onError: "quota" });
    assert.equal(r.using_fallback, true);
    assert.equal(r.effective.model, "gpt-5.4-mini");
    assert.equal(r.reason, "quota");
  });

  it("returns primary for agents without error trigger", () => {
    const r = resolve("plan", { ledgerPath: ledgerFile });
    assert.equal(r.using_fallback, false);
    assert.equal(r.effective.model, "gpt-5.5");
  });

  it("reports no-entry for unknown agent", () => {
    const r = resolve("nonexistent-agent-xyz", { ledgerPath: ledgerFile });
    assert.equal(r.reason, "no-entry");
    assert.equal(r.primary, null);
  });
});

rmSync(tmp, { recursive: true, force: true });
