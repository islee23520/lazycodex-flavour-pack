import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ROLE_POLICY_CONFIG_NAME = "lfp-role-policies.toml";

export const ROLE_POLICY_REPORT_ORDER = [
  "explorer",
  "librarian",
  "metis",
  "plan",
  "momus",
  "lazycodex-executor",
  "lazycodex-code-reviewer",
  "lazycodex-qa-executor",
  "lazycodex-gate-reviewer",
  "lazycodex-clone-fidelity-reviewer"
];

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VALID_REASONING = new Set(["low", "medium", "high", "xhigh"]);
const VALID_TIER = new Set(["fast", "default"]);

let cachedRolePolicyConfig = null;

export function getDefaultRolePolicyConfigPath() {
  return path.join(ROOT, "agent-configs", ROLE_POLICY_CONFIG_NAME);
}

export function getUserRolePolicyConfigPath(options = {}) {
  const codexHome = options.env?.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  // Legacy sidecar path. The canonical source is ~/.codex/lfp.json `rolePolicies` when present.
  return path.join(codexHome, "lfp", ROLE_POLICY_CONFIG_NAME);
}

export function readRolePolicyConfig(options = {}) {
  const defaultPath = getDefaultRolePolicyConfigPath();
  const userConfigPath = getUserRolePolicyConfigPath(options);
  const userPath = existsSync(userConfigPath) ? userConfigPath : null;
  const fingerprint = `${defaultPath}:${fileMtime(defaultPath)}|${userConfigPath}:${fileMtime(userConfigPath)}`;

  if (cachedRolePolicyConfig?.fingerprint === fingerprint) return cachedRolePolicyConfig.value;

  const packagedPolicies = parseRolePolicyToml(readFileSync(defaultPath, "utf8"));
  const userPolicies = userPath === null ? {} : parseRolePolicyToml(readFileSync(userPath, "utf8"));
  const value = {
    source: { defaultPath, userPath },
    policies: mergeRolePolicies(packagedPolicies, userPolicies)
  };
  cachedRolePolicyConfig = { fingerprint, value };
  return value;
}

export function parseRolePolicyToml(text) {
  const policies = {};
  let currentRole = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const sectionMatch = line.match(/^\[policies\.([A-Za-z0-9_.-]+)\]$/);
    if (sectionMatch !== null) {
      currentRole = sectionMatch[1];
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      currentRole = null;
      continue;
    }

    if (currentRole === null) continue;

    const assignmentMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"$/);
    if (assignmentMatch === null) continue;

    const [, key, value] = assignmentMatch;
    if (key === "reasoning" && VALID_REASONING.has(value)) {
      policies[currentRole] = { ...(policies[currentRole] ?? {}), reasoning: value };
    }
    if (key === "tier" && VALID_TIER.has(value)) {
      policies[currentRole] = { ...(policies[currentRole] ?? {}), tier: value };
    }
  }

  return policies;
}

export function mergeRolePolicies(packagedPolicies, userPolicies) {
  const merged = {};
  for (const [role, fields] of Object.entries(packagedPolicies ?? {})) {
    merged[role] = { ...fields };
  }
  for (const [role, fields] of Object.entries(userPolicies ?? {})) {
    merged[role] = { ...(merged[role] ?? {}), ...fields };
  }
  return merged;
}

export function clearRolePolicyConfigCache() {
  cachedRolePolicyConfig = null;
}

function fileMtime(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return "missing";
  }
}
