import assert from "node:assert/strict";
import test from "node:test";
import { getModelSetupGuide } from "../src/model/model-setup-guidance.ts";

const FALLBACK_ROLE = "Agent-specific override.";

const REMOVED_LFP_AGENTS = ["oracle", "prometheus", "hephaestus", "atlas", "sisyphus-junior"] as const;

test("given removed LFP-owned agent when getting setup guide then returns fallback guide", () => {
  for (const agentName of REMOVED_LFP_AGENTS) {
    const guide = getModelSetupGuide(agentName);
    assert.equal(guide.role, FALLBACK_ROLE, `${agentName} should fall back to the generic guide`);
  }
});

test("given existing OMO agent when getting setup guide then returns role-specific guide", () => {
  for (const agentName of ["explorer", "plan", "lazycodex-executor", "lazycodex-gate-reviewer"] as const) {
    const guide = getModelSetupGuide(agentName);
    assert.notEqual(guide.role, FALLBACK_ROLE, `${agentName} should have dedicated guide`);
    assert.ok(guide.tuneFor.length > 0);
    assert.ok(guide.minimum.length > 0);
  }
});
