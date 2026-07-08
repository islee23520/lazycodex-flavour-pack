import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const AGENT_CONFIGS_DIR = path.resolve(import.meta.dirname, "..", "agent-configs");

const LFP_OWNED_AGENTS = ["oracle", "prometheus", "hephaestus", "atlas", "sisyphus-junior"];

const VALID_REASONING = ["low", "medium", "high", "xhigh"];
const VALID_TIERS = ["default", "fast"];

function parseAgentToml(filePath: string) {
  const text = readFileSync(filePath, "utf8");
  const config: Record<string, string> = {};
  let inAgentSection = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const secMatch = line.match(/^\[([^\]]+)\]$/);
    if (secMatch) {
      inAgentSection = secMatch[1].startsWith("agents.");
      continue;
    }
    if (!inAgentSection) continue;
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"$/);
    if (!m) continue;
    config[m[1]] = m[2];
  }
  return config;
}

for (const agentName of LFP_OWNED_AGENTS) {
  test(`given ${agentName} config when parsed then has 6 valid fields`, () => {
    const filePath = path.join(AGENT_CONFIGS_DIR, `${agentName}.toml`);
    const config = parseAgentToml(filePath);

    assert.ok(config.model, `${agentName} must have model`);
    assert.ok(typeof config.model === "string" && config.model.length > 0);

    assert.ok(
      VALID_REASONING.includes(config.model_reasoning_effort),
      `${agentName} reasoning invalid: ${config.model_reasoning_effort}`
    );
    assert.ok(VALID_TIERS.includes(config.service_tier), `${agentName} tier invalid: ${config.service_tier}`);

    assert.ok(config.model_fallback, `${agentName} must have model_fallback`);
    assert.ok(typeof config.model_fallback === "string" && config.model_fallback.length > 0);
    assert.ok(
      VALID_REASONING.includes(config.model_fallback_reasoning_effort),
      `${agentName} fallback reasoning invalid`
    );
    assert.ok(VALID_TIERS.includes(config.model_fallback_service_tier), `${agentName} fallback tier invalid`);
  });
}
