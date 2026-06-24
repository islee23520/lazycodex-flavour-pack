import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os, { tmpdir } from "node:os";
import path from "node:path";
import { readOverrideConfig } from "./model-override-config.js";
import { LegacyV1SavedUserOverrideConfigSchema, SavedUserModelOverrideConfigSchema } from "./model-override-schema.js";
import { pruneRemovedLfpAgentOverrides } from "./removed-lfp-agents.js";
import { syncAgentOverrides } from "./sync-agent-overrides.js";

const USER_OVERRIDE_CONFIG_NAME = "lfp.json";
const LEGACY_JSON_OVERRIDE_CONFIG_NAME = "omo-agent-model-overrides.json";
const LEGACY_OVERRIDE_CONFIG_NAME = "omo-agent-model-overrides.toml";
const LFP_DIR = "lfp";
const LEGACY_LEDGER_DIR = ".ledger";
const SOURCE_SECTION_PATTERN = /(^|\n)\[source]\n[\s\S]*?(?=\n\[[^\n]+]|$)/;

export function getUserOverrideConfigPath(options = {}) {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  return options.userOverrideConfigPath ?? path.join(codexHome, USER_OVERRIDE_CONFIG_NAME);
}

export function getLegacyUserOverrideConfigPath(options = {}) {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  return path.join(codexHome, LEGACY_LEDGER_DIR, LFP_DIR, LEGACY_OVERRIDE_CONFIG_NAME);
}

export function hasSavedUserOverrideConfig(userConfigPath) {
  return existsSync(userConfigPath);
}

export function migrateLegacyUserOverrideConfig(options = {}) {
  const targetPath = getUserOverrideConfigPath(options);
  if (existsSync(targetPath)) return targetPath;

  const legacyPath = getLegacyUserOverrideConfigPaths(options).find((candidatePath) => existsSync(candidatePath));
  if (legacyPath === undefined) return targetPath;

  const legacyConfig = legacyPath.endsWith(".json")
    ? readLegacyJsonOverrideConfig(legacyPath)
    : parseLegacyOverrideToml(legacyPath);
  writeSavedUserOverrideConfig(targetPath, legacyConfig);
  return targetPath;
}

export function restoreUserOverrideConfig(configPath, userConfigPath) {
  const currentText = readFileSync(configPath, "utf8");
  const userText = savedOverrideConfigToToml(readSavedUserOverrideConfig(userConfigPath));
  writeFileSync(configPath, mergeUserOverrideText(currentText, userText));
}

export function restoreSavedUserOverrideConfigIfPresent(configPath, options = {}) {
  if (!configPath.endsWith(".toml")) return null;

  const userConfigPath = migrateLegacyUserOverrideConfig(options);
  if (!hasSavedUserOverrideConfig(userConfigPath)) return null;

  restoreUserOverrideConfig(configPath, userConfigPath);
  return userConfigPath;
}

export function restoreAgentModelApplication(configPath, previousUserConfigPath, options = {}) {
  const previousConfig = readSavedUserOverrideConfig(previousUserConfigPath);
  const userConfigPath = getUserOverrideConfigPath(options);
  const currentText = readFileSync(configPath, "utf8");
  const previousText = savedOverrideConfigToToml(previousConfig);
  const tempDir = mkdtempSync(path.join(tmpdir(), "lfp-rollback-overrides-"));
  const tempConfigPath = path.join(tempDir, LEGACY_OVERRIDE_CONFIG_NAME);

  try {
    writeFileSync(tempConfigPath, mergeUserOverrideText(currentText, previousText));
    const result = syncAgentOverrides(tempConfigPath, options);
    writeSavedUserOverrideConfig(userConfigPath, previousConfig);
    return {
      changed: result.changed,
      savedConfigPath: userConfigPath,
      restoredFrom: previousUserConfigPath
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function createRestoredUserOverrideConfig(configPath, options = {}) {
  if (!configPath.endsWith(".toml")) return null;

  const userConfigPath = migrateLegacyUserOverrideConfig(options);
  if (!hasSavedUserOverrideConfig(userConfigPath)) return null;

  const currentText = readFileSync(configPath, "utf8");
  const userText = savedOverrideConfigToToml(readSavedUserOverrideConfig(userConfigPath));
  const tempDir = mkdtempSync(path.join(tmpdir(), "lfp-overrides-"));
  const tempConfigPath = path.join(tempDir, LEGACY_OVERRIDE_CONFIG_NAME);
  writeFileSync(tempConfigPath, mergeUserOverrideText(currentText, userText));

  return {
    configPath: tempConfigPath,
    restoredPath: userConfigPath,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true })
  };
}

export function saveUserOverrideConfig(configPath, userConfigPath) {
  if (typeof userConfigPath === "object" && userConfigPath !== null) {
    writeSavedUserOverrideConfig(configPath, userConfigPath);
    return;
  }

  if (!configPath.endsWith(".toml")) return;

  const currentConfig = readOverrideConfig(configPath);
  writeSavedUserOverrideConfig(userConfigPath, { overrides: currentConfig.overrides ?? {} });
}

export function mergeUserOverrideText(currentText, userText) {
  const currentSource = SOURCE_SECTION_PATTERN.exec(currentText)?.[0] ?? "";
  const userWithoutSource = stripSourceSection(userText);
  return `${currentSource.trimEnd()}\n\n${userWithoutSource.trim().replace(/\n*$/, "")}\n`;
}

function stripSourceSection(text) {
  return text.replace(SOURCE_SECTION_PATTERN, "").replace(/^\n+/, "");
}

function getLegacyUserOverrideConfigPaths(options = {}) {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  return [
    path.join(codexHome, LFP_DIR, LEGACY_JSON_OVERRIDE_CONFIG_NAME),
    path.join(codexHome, LFP_DIR, LEGACY_OVERRIDE_CONFIG_NAME),
    getLegacyUserOverrideConfigPath(options)
  ];
}

function readLegacyJsonOverrideConfig(configPath) {
  const parsed = JSON.parse(readFileSync(configPath, "utf8"));
  if (parsed.schemaVersion === 2) return SavedUserModelOverrideConfigSchema.parse(parsed);
  return LegacyV1SavedUserOverrideConfigSchema.parse(parsed);
}

function parseLegacyOverrideToml(configPath) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "lfp-legacy-overrides-"));
  const tempConfigPath = path.join(tempDir, LEGACY_OVERRIDE_CONFIG_NAME);
  try {
    const text = readFileSync(configPath, "utf8");
    writeFileSync(tempConfigPath, mergeUserOverrideText('[source]\nagents_dir = "${CODEX_HOME}/agents"\n', text));
    return readOverrideConfig(tempConfigPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readSavedUserOverrideConfig(userConfigPath) {
  const text = readFileSync(userConfigPath, "utf8");
  return sanitizeSavedOverrideConfig(SavedUserModelOverrideConfigSchema.parse(migrateToV2(JSON.parse(text))));
}

function writeSavedUserOverrideConfig(userConfigPath, value) {
  const parsed = sanitizeSavedOverrideConfig(SavedUserModelOverrideConfigSchema.parse(migrateToV2(value)));
  mkdirSync(path.dirname(userConfigPath), { recursive: true });
  const tmpPath = `${userConfigPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(parsed, null, 2)}\n`);
  renameSync(tmpPath, userConfigPath);
}

function sanitizeSavedOverrideConfig(config) {
  return {
    ...config,
    overrides: pruneRemovedLfpAgentOverrides(config.overrides ?? {})
  };
}

function migrateToV2(config) {
  if (config.schemaVersion === 2) return config;

  return {
    schemaVersion: 2,
    source: { agentsDir: "${CODEX_HOME}/agents" },
    overrides: config.overrides ?? {},
    rolePolicies: {}
  };
}

function savedOverrideConfigToToml(config) {
  const lines = [];
  for (const [agentName, fields] of Object.entries(config.overrides)) {
    lines.push(`[agents.${agentName}]`);
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === "string") lines.push(`${key} = ${JSON.stringify(value)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
