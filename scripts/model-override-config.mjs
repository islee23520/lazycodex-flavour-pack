import os from "node:os";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  LegacyV1SavedUserOverrideConfigSchema,
  parseModelOverrideConfig,
  SavedUserModelOverrideConfigSchema
} from "./model-override-schema.mjs";

const MODEL_FIELDS = new Set(["model", "model_reasoning_effort", "service_tier"]);
const FALLBACK_FIELDS = new Set(["model_fallback", "model_fallback_reasoning_effort", "model_fallback_service_tier"]);

export function readOverrideConfig(configPath, options = {}) {
  const text = readOverrideConfigText(configPath);
  const env = options.env ?? process.env;
  if (configPath.endsWith(".json")) return normalizeOverrideConfig(JSON.parse(text), env);
  if (configPath.endsWith(".toml")) return normalizeOverrideConfig(parseOverrideToml(text), env);
  throw new TypeError(`Unsupported override config format: ${configPath}`);
}

function readOverrideConfigText(configPath) {
  try {
    return readFileSync(configPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Override config does not exist: ${configPath}`);
    }
    throw error;
  }
}

function parseOverrideToml(text) {
  const config = { source: {}, overrides: {} };
  let section = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (section.startsWith("agents.")) {
        const agentName = section.slice("agents.".length);
        config.overrides[agentName] ??= {};
      }
      continue;
    }

    const assignmentMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"$/);
    if (!assignmentMatch || section === null) continue;

    const [, key, value] = assignmentMatch;
    if (section === "source" && key === "agents_dir") {
      config.source.agentsDir = value;
      continue;
    }

    if (section.startsWith("agents.") && (MODEL_FIELDS.has(key) || FALLBACK_FIELDS.has(key))) {
      const agentName = section.slice("agents.".length);
      config.overrides[agentName][key] = value;
    }
  }

  return config;
}

function normalizeOverrideConfig(config, env) {
  const parsed = parseModelOverrideConfig(migrateJsonOverrideConfig(config));
  return {
    ...parsed,
    source: {
      ...parsed.source,
      agentsDir: expandConfigPath(parsed.source?.agentsDir, env)
    }
  };
}

function migrateJsonOverrideConfig(config) {
  if (config?.schemaVersion === 2) {
    const parsed = SavedUserModelOverrideConfigSchema.parse(config);
    return {
      source: parsed.source,
      overrides: parsed.overrides,
      rolePolicies: parsed.rolePolicies
    };
  }

  if (config?.schemaVersion === 1) {
    const parsed = LegacyV1SavedUserOverrideConfigSchema.parse(config);
    return {
      source: { agentsDir: "${CODEX_HOME}/agents" },
      overrides: parsed.overrides,
      rolePolicies: {}
    };
  }

  return config;
}

function expandConfigPath(value, env) {
  if (typeof value !== "string") return value;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  const replacements = {
    CODEX_HOME: codexHome,
    HOME: env.HOME?.trim() || os.homedir()
  };

  return value.replace(/\$\{([A-Z_]+)\}/g, (match, key) => replacements[key] ?? match);
}
