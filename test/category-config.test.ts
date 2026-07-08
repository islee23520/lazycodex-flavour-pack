import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const CONFIG_PATH = path.resolve(import.meta.dirname, "..", "agent-configs", "lfp-categories.toml");

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

const VALID_REASONING = ["low", "medium", "high", "xhigh"];
const VALID_TIERS = ["default", "fast"];

function parseCategoryToml(text: string) {
  const categories: Record<string, Record<string, unknown>> = {};
  let currentCategory: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const secMatch = line.match(/^\[categories\.([A-Za-z0-9_-]+)\]$/);
    if (secMatch) {
      currentCategory = secMatch[1];
      categories[currentCategory] = {};
      continue;
    }
    if (!currentCategory) continue;
    const m = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.startsWith('"') ? rawValue.slice(1, -1) : rawValue;
    categories[currentCategory][key] = value;
  }
  return categories;
}

test("given lfp-categories.toml when parsed then has 8 categories with required fields", () => {
  const text = readFileSync(CONFIG_PATH, "utf8");
  const categories = parseCategoryToml(text);

  for (const name of EXPECTED_CATEGORIES) {
    const cat = categories[name];
    assert.ok(cat, `Category ${name} must exist`);
    assert.ok(typeof cat.model === "string" && (cat.model as string).length > 0, `${name} must have model`);
    assert.ok(VALID_REASONING.includes(cat.model_reasoning_effort as string), `${name} reasoning invalid`);
    assert.ok(VALID_TIERS.includes(cat.service_tier as string), `${name} tier invalid`);
    assert.ok(
      typeof cat.fallback_models === "string" && (cat.fallback_models as string).length > 0,
      `${name} must have fallback_models`
    );
  }
});
