import os from "node:os";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const USER_OVERRIDE_CONFIG_NAME = "omo-agent-model-overrides.toml";
const LEDGER_DIR = ".ledger";
const LEGACY_LFP_DIR = "lfp";
const SOURCE_SECTION_PATTERN = /(^|\n)\[source]\n[\s\S]*?(?=\n\[[^\n]+]|$)/;

export function getUserOverrideConfigPath(options = {}) {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  return options.userOverrideConfigPath ?? path.join(codexHome, LEDGER_DIR, "lfp", USER_OVERRIDE_CONFIG_NAME);
}

export function getLegacyUserOverrideConfigPath(options = {}) {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  return path.join(codexHome, LEGACY_LFP_DIR, USER_OVERRIDE_CONFIG_NAME);
}

export function hasSavedUserOverrideConfig(userConfigPath) {
  return existsSync(userConfigPath);
}

export function migrateLegacyUserOverrideConfig(options = {}) {
  const targetPath = getUserOverrideConfigPath(options);
  const legacyPath = getLegacyUserOverrideConfigPath(options);
  if (existsSync(targetPath) || !existsSync(legacyPath)) return targetPath;

  mkdirSync(path.dirname(targetPath), { recursive: true });
  copyFileSync(legacyPath, targetPath);
  return targetPath;
}

export function restoreUserOverrideConfig(configPath, userConfigPath) {
  const currentText = readFileSync(configPath, "utf8");
  const userText = readFileSync(userConfigPath, "utf8");
  writeFileSync(configPath, mergeUserOverrideText(currentText, userText));
}

export function saveUserOverrideConfig(configPath, userConfigPath) {
  if (!configPath.endsWith(".toml")) return;

  mkdirSync(path.dirname(userConfigPath), { recursive: true });
  const currentText = readFileSync(configPath, "utf8");
  writeFileSync(userConfigPath, stripSourceSection(currentText));
}

export function mergeUserOverrideText(currentText, userText) {
  const currentSource = SOURCE_SECTION_PATTERN.exec(currentText)?.[0] ?? "";
  const userWithoutSource = stripSourceSection(userText);
  return `${currentSource.trimEnd()}\n\n${userWithoutSource.trim().replace(/\n*$/, "")}\n`;
}

function stripSourceSection(text) {
  return text.replace(SOURCE_SECTION_PATTERN, "").replace(/^\n+/, "");
}
