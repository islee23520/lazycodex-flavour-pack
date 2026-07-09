import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { REMOVED_LFP_AGENT_NAMES } from "../src/model/removed-lfp-agents.ts";

const AGENT_CONFIGS_DIR = path.resolve(import.meta.dirname, "..", "agent-configs");
const LEGACY_OVERRIDE_JSON = path.resolve(import.meta.dirname, "..", "agent-overrides", "omo.json");

// Removed LFP-owned agents: never dispatched by upstream OMO, must stay unpackaged.
const REMOVED_LFP_AGENT_FILES = [
  "oracle.toml",
  "prometheus.toml",
  "hephaestus.toml",
  "atlas.toml",
  "sisyphus-junior.toml"
];

test("given removed LFP-owned agents when checking packaged configs then none ship as agent tomls", () => {
  for (const fileName of REMOVED_LFP_AGENT_FILES) {
    assert.equal(existsSync(path.join(AGENT_CONFIGS_DIR, fileName)), false, `${fileName} must not be packaged`);
  }
});

test("given the legacy override json when checking then it pins no removed LFP-owned agent", () => {
  const overrides = JSON.parse(readFileSync(LEGACY_OVERRIDE_JSON, "utf8")).overrides ?? {};
  const offenders = Object.keys(overrides).filter((agentName) => REMOVED_LFP_AGENT_NAMES.has(agentName));
  assert.deepEqual(
    offenders,
    [],
    `legacy omo.json must not override removed agents (model is dynamic / pruned): ${offenders.join(", ")}`
  );
});

test("given removed LFP-owned agent names when checking then none duplicate an upstream OMO agent", () => {
  const omoCodexAgentFiles = new Set([
    "explorer.toml",
    "librarian.toml",
    "metis.toml",
    "momus.toml",
    "plan.toml",
    "lazycodex-executor.toml",
    "lazycodex-code-reviewer.toml",
    "lazycodex-qa-executor.toml",
    "lazycodex-gate-reviewer.toml",
    "lazycodex-clone-fidelity-reviewer.toml"
  ]);
  for (const fileName of REMOVED_LFP_AGENT_FILES) {
    assert.equal(omoCodexAgentFiles.has(fileName), false, `${fileName} duplicates an OMO Codex agent`);
  }
});
