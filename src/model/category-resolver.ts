import { readFileSync } from "node:fs";
import path from "node:path";
import { getPackageRoot } from "../utils/package-root.js";

const CONFIG_PATH = path.join(getPackageRoot(import.meta.url), "agent-configs", "lfp-categories.toml");

interface CategoryEntry {
  model: string;
  model_reasoning_effort: string;
  service_tier: string;
  fallback_models: string[];
  keywords: string[];
}

let cachedCategories: Record<string, CategoryEntry> | null = null;

function parseCategoryToml(text: string): Record<string, CategoryEntry> {
  const categories: Record<string, CategoryEntry> = {};
  let currentCategory: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const secMatch = line.match(/^\[categories\.([A-Za-z0-9_-]+)\]$/);
    if (secMatch) {
      currentCategory = secMatch[1];
      categories[currentCategory] = {
        model: "",
        model_reasoning_effort: "low",
        service_tier: "default",
        fallback_models: [],
        keywords: []
      };
      continue;
    }

    if (!currentCategory) continue;
    const m = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!m) continue;

    const [, key, rawValue] = m;
    const entry = categories[currentCategory];

    if (key === "fallback_models" || key === "keywords") {
      const items = rawValue.match(/"([^"]+)"/g);
      entry[key] = items ? items.map((s) => s.slice(1, -1)) : [];
    } else if (rawValue.startsWith('"')) {
      entry[key as keyof CategoryEntry] = rawValue.slice(1, -1) as never;
    }
  }

  return categories;
}

function loadCategories(): Record<string, CategoryEntry> {
  if (cachedCategories) return cachedCategories;
  const text = readFileSync(CONFIG_PATH, "utf8");
  cachedCategories = parseCategoryToml(text);
  return cachedCategories;
}

export function resolveCategory(categoryName: string): CategoryEntry | null {
  const categories = loadCategories();
  return categories[categoryName] ?? null;
}

export function resolveCategoryForPrompt(promptText: string): string | null {
  const categories = loadCategories();
  const text = promptText.toLowerCase();
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const [name, entry] of Object.entries(categories)) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (text.includes(keyword.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = name;
    }
  }

  return bestMatch;
}

export function getAllCategories(): string[] {
  return Object.keys(loadCategories());
}
