import assert from "node:assert/strict";
import test from "node:test";
import { getModelSetupGuide } from "../src/model/model-setup-guidance.ts";

const FALLBACK_ROLE = "Agent-specific override.";

const LFP_OWNED_AGENTS = ["oracle", "prometheus", "hephaestus", "atlas", "sisyphus-junior"] as const;

test("given LFP-owned agent when getting setup guide then returns role-specific guide not fallback", () => {
  for (const agentName of LFP_OWNED_AGENTS) {
    const guide = getModelSetupGuide(agentName);
    assert.notEqual(guide.role, FALLBACK_ROLE, `${agentName} should have dedicated guide`);
    assert.ok(guide.tuneFor.length > 0);
    assert.ok(guide.minimum.length > 0);
  }
});

test("given oracle when getting setup guide then matches expected role text", () => {
  const guide = getModelSetupGuide("oracle");
  assert.match(guide.role, /read-only architecture/i);
});
