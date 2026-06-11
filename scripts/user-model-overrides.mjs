import os from "node:os";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { SavedUserModelOverrideConfigSchema } from "./model-override-schema.mjs";
import { readOverrideConfig } from "./model-override-config.mjs";

const USER_OVERRIDE_CONFIG_NAME = "omo-agent-model-overrides.json";
const LEGACY_OVERRIDE_CONFIG_NAME = "omo-agent-model-overrides.toml";
const LFP_DIR = "lfp";
const LEGACY_LEDGER_DIR = ".ledger";
const SOURCE_SECTION_PATTERN = /(^|\n)\[source]\n[\s\S]*?(?=\n\[[^\n]+]|$)/;

export function getUserOverrideConfigPath(options = {}) {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  return options.userOverrideConfigPath ?? path.join(codexHome, LFP_DIR, USER_OVERRIDE_CONFIG_NAME);
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

  writeSavedUserOverrideConfig(targetPath, { overrides: parseLegacyOverrideToml(legacyPath).overrides });
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
    path.join(codexHome, LFP_DIR, LEGACY_OVERRIDE_CONFIG_NAME),
    getLegacyUserOverrideConfigPath(options)
  ];
}

function parseLegacyOverrideToml(configPath) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "lfp-legacy-overrides-"));
  const tempConfigPath = path.join(tempDir, LEGACY_OVERRIDE_CONFIG_NAME);
  try {
    const text = readFileSync(configPath, "utf8");
    writeFileSync(tempConfigPath, mergeUserOverrideText("[source]\nagents_dir = \"${CODEX_HOME}/agents\"\n", text));
    return readOverrideConfig(tempConfigPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readSavedUserOverrideConfig(userConfigPath) {
  const text = readFileSync(userConfigPath, "utf8");
  return SavedUserModelOverrideConfigSchema.parse(JSON.parse(text));
}

function writeSavedUserOverrideConfig(userConfigPath, value) {
  const parsed = SavedUserModelOverrideConfigSchema.parse({
    schemaVersion: 1,
    overrides: value.overrides ?? {}
  });
  mkdirSync(path.dirname(userConfigPath), { recursive: true });
  writeFileSync(userConfigPath, `${JSON.stringify(parsed, null, 2)}\n`);
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
