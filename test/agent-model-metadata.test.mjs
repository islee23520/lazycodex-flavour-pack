import test from "node:test";
import assert from "node:assert/strict";
import {
  LFP_OWNED_AGENT_NAMES,
  ART_AGENT_NAMES,
  ART_AGENT_METADATA,
  getAgentDisplayName,
  getAgentDescription,
  isLfpOwnedAgent,
  isArtAgent
} from "../scripts/agent-model-metadata.mjs";

test("given LFP-owned agent names when checking then returns expected list", () => {
  assert.ok(LFP_OWNED_AGENT_NAMES.includes("sisyphus"));
  assert.ok(LFP_OWNED_AGENT_NAMES.includes("artistry"));
  assert.ok(LFP_OWNED_AGENT_NAMES.includes("visual-engineering"));
  assert.equal(LFP_OWNED_AGENT_NAMES.length, 6);
});

test("given art agent names when checking then returns expected list", () => {
  assert.deepEqual(ART_AGENT_NAMES, ["artistry", "artistry-gen", "artistry-qa"]);
  assert.deepEqual(Object.keys(ART_AGENT_METADATA), ART_AGENT_NAMES);
});

test("given artistry agent when getting display name then includes role label", () => {
  assert.equal(getAgentDisplayName("artistry"), "artistry (Art Director (supervisor))");
  assert.equal(getAgentDisplayName("artistry-gen"), "artistry-gen (Production Worker (loop))");
  assert.equal(getAgentDisplayName("artistry-qa"), "artistry-qa (Visual QA Inspector)");
});

test("given non-art agent when getting display name then returns name only", () => {
  assert.equal(getAgentDisplayName("explorer"), "explorer");
  assert.equal(getAgentDisplayName("sisyphus"), "sisyphus");
});

test("given art agent when getting description then returns role description", () => {
  assert.match(getAgentDescription("artistry"), /creative direction/);
  assert.match(getAgentDescription("artistry-gen"), /Computer Use/);
  assert.match(getAgentDescription("artistry-qa"), /screenshots/);
  assert.equal(getAgentDescription("explorer"), null);
});

test("given agent name when checking ownership then returns correct boolean", () => {
  assert.equal(isLfpOwnedAgent("sisyphus"), true);
  assert.equal(isLfpOwnedAgent("explorer"), false);
  assert.equal(isArtAgent("artistry"), true);
  assert.equal(isArtAgent("sisyphus"), false);
});
