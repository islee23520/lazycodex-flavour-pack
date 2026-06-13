import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readOverrideConfig } from "./model-override-config.mjs";
import { getUserOverrideConfigPath } from "./user-model-overrides.mjs";

const MODEL_FIELDS = ["model", "model_reasoning_effort", "service_tier"];

export function applyRecommendedOverrides(currentConfig, recommendations, env) {
  const applied = [];
  const userPath = getUserOverrideConfigPath({ env });
  const next = { schemaVersion: 1, overrides: { ...(currentConfig.overrides ?? {}) } };
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
  const userPath = getUserOverrideConfigPath({ env });
  if (existsSync(userPath)) return readOverrideConfig(userPath, { env });
  return readOverrideConfig(configPath ?? path.join(env.PWD ?? process.cwd(), "agent-configs", "omo-agent-model-overrides.toml"), { env });
}

function pickOverrideFields(fields) {
  const picked = {};
  for (const key of MODEL_FIELDS) if (fields[key]) picked[key] = fields[key];
  return picked;
}
