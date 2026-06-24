import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { AGENT_MODEL_FIELDS } from "./model-field-scope.js";
import { readOverrideConfig } from "./model-override-config.js";
import { getUserOverrideConfigPath, migrateLegacyUserOverrideConfig } from "./user-model-overrides.js";

const MODEL_FIELDS = [...AGENT_MODEL_FIELDS];

export function applyRecommendedOverrides(currentConfig, recommendations, env) {
  const applied = [];
  const userPath = getUserOverrideConfigPath({ env });
  const next = {
    schemaVersion: 2,
    source: { agentsDir: "${CODEX_HOME}/agents" },
    overrides: pickAllOverrideFields(currentConfig.overrides ?? {}),
    rolePolicies: currentConfig.rolePolicies ?? {}
  };
  for (const [role, recommendation] of Object.entries(recommendations)) {
    if (!recommendation.changed) continue;
    next.overrides[role] = { ...(next.overrides[role] ?? {}), ...pickOverrideFields(recommendation) };
    applied.push(role);
  }
  if (applied.length > 0) {
    mkdirSync(path.dirname(userPath), { recursive: true });
    writeFileSync(userPath, `${JSON.stringify(next, null, 2)}\n`);
  }
  return applied;
}

export function readCurrentOverrideConfig(configPath, env) {
  const userPath = migrateLegacyUserOverrideConfig({ env });
  if (existsSync(userPath)) return readOverrideConfig(userPath, { env });
  return readOverrideConfig(configPath ?? getUserOverrideConfigPath({ env }), { env });
}

function pickAllOverrideFields(overrides) {
  const picked = {};
  for (const [role, fields] of Object.entries(overrides)) {
    picked[role] = pickOverrideFields(fields);
  }
  return picked;
}

function pickOverrideFields(fields) {
  const picked = {};
  for (const key of MODEL_FIELDS) if (fields[key]) picked[key] = fields[key];
  return picked;
}
