import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const CONFIG_PATH = path.resolve(import.meta.dirname, "..", "agent-configs", "lfp-fallback-chains.toml");

const EXPECTED_AGENTS = ["oracle", "prometheus", "hephaestus", "atlas", "sisyphus-junior"];
const EXPECTED_CATEGORIES = [
  "visual-engineering",
  "ultrabrain",
  "deep",
  "artistry",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing"
];

function parseFallbackChains(text: string) {
  const agents: Record<string, string[]> = {};
  const categories: Record<string, string[]> = {};
  let section: "agents" | "categories" | null = null;
  let currentName: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const agentMatch = line.match(/^\[agents\.([A-Za-z0-9_-]+)\]$/);
    if (agentMatch) {
      section = "agents";
      currentName = agentMatch[1];
      continue;
    }

    const catMatch = line.match(/^\[categories\.([A-Za-z0-9_-]+)\]$/);
    if (catMatch) {
      section = "categories";
      currentName = catMatch[1];
      continue;
    }

    const chainMatch = line.match(/^chain\s*=\s*\[(.+)\]$/);
    if (!chainMatch || !currentName || !section) continue;

    const models = chainMatch[1].match(/"([^"]+)"/g);
    const chain = models ? models.map((s) => s.slice(1, -1)) : [];

    if (section === "agents") {
      agents[currentName] = chain;
    } else {
      categories[currentName] = chain;
    }
  }

  return { agents, categories };
}

test("given fallback chains config when parsed then has 5 agent chains", () => {
  const text = readFileSync(CONFIG_PATH, "utf8");
  const { agents } = parseFallbackChains(text);

  for (const name of EXPECTED_AGENTS) {
    assert.ok(agents[name], `Agent ${name} must have a fallback chain`);
    assert.ok(agents[name].length >= 2, `Agent ${name} chain must have at least 2 models`);
  }
});

test("given fallback chains config when parsed then has 8 category chains", () => {
  const text = readFileSync(CONFIG_PATH, "utf8");
  const { categories } = parseFallbackChains(text);

  for (const name of EXPECTED_CATEGORIES) {
    assert.ok(categories[name], `Category ${name} must have a fallback chain`);
    assert.ok(categories[name].length >= 2, `Category ${name} chain must have at least 2 models`);
  }
});
