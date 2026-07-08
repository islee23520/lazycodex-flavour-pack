import assert from "node:assert/strict";
import test from "node:test";
import {
  ART_AGENT_METADATA,
  ART_AGENT_NAMES,
  getAgentDescription,
  getAgentDisplayName,
  isArtAgent,
  isLfpOwnedAgent,
  LFP_OWNED_AGENT_NAMES
} from "../src/model/agent-model-metadata.ts";

const EXPECTED_LFP_OWNED = ["oracle", "prometheus", "hephaestus", "atlas", "sisyphus-junior"];

test("given LFP-owned agent names when checking then returns expected list", () => {
  assert.deepEqual(LFP_OWNED_AGENT_NAMES, EXPECTED_LFP_OWNED);
});

test("given art agent names when checking then returns expected list", () => {
  assert.deepEqual(ART_AGENT_NAMES, []);
  assert.deepEqual(Object.keys(ART_AGENT_METADATA), ART_AGENT_NAMES);
});

test("given agent when getting display name then returns name only", () => {
  assert.equal(getAgentDisplayName("explorer"), "explorer");
  assert.equal(getAgentDisplayName("plan"), "plan");
});

test("given agent name when checking ownership then returns correct boolean", () => {
  assert.equal(getAgentDescription("explorer"), null);
  assert.equal(isLfpOwnedAgent("plan"), false);
  assert.equal(isLfpOwnedAgent("explorer"), false);
  assert.equal(isLfpOwnedAgent("oracle"), true);
  assert.equal(isLfpOwnedAgent("sisyphus-junior"), true);
  assert.equal(isArtAgent("artistry"), false);
});
