import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ADDITIONAL_AGENT_CONFIGS, MARKETPLACE_ID, PLUGIN_ID, PLUGIN_REF, getCodexPluginState } from "./codex-plugin-install.mjs";
import { cleanupInstallSnapshot, createInstallSnapshot, restoreInstallSnapshot } from "./install-transaction.mjs";
import { escapeRegExp } from "./toml-string-utils.mjs";

export function deleteCodexPlugin(options = {}) {
  const state = getCodexPluginState(options);
  const snapshot = createInstallSnapshot(state);
  const pluginBackup = backupPluginRoot(state.pluginRoot);

  try {
    removeAdditionalAgents(state);
    removeCodexConfig(state);
    removeEmptyMarketplaceRoot(state);
    cleanupPluginBackup(pluginBackup);
    cleanupInstallSnapshot(snapshot);
    return getCodexPluginState(options);
  } catch (error) {
    restoreInstallSnapshot(snapshot);
    restorePluginRoot(pluginBackup);
    cleanupInstallSnapshot(snapshot);
    throw error;
  }
}

export function getPendingCodexPluginDeleteActions(options = {}) {
  const state = getCodexPluginState(options);
  const currentConfig = readTextIfExists(state.configPath);
  const actions = [];
  if (state.pluginFilesInstalled || existsSync(state.pluginRoot)) actions.push(`remove plugin files from ${state.pluginRoot}`);
  if (state.additionalAgentFiles.some((filePath) => existsSync(filePath))) {
    actions.push(`remove LFP agents from ${path.join(state.codexHome, "agents")}`);
  }
  if (state.pluginEnabled) actions.push(`remove plugin ${PLUGIN_REF} from ${state.configPath}`);
  if (state.marketplaceConfigured && !hasOtherMarketplacePlugins(state, currentConfig)) {
    actions.push(`remove marketplace ${MARKETPLACE_ID} from ${state.configPath}`);
  }
  return { state, actions };
}

function removeAdditionalAgents(state) {
  for (const fileName of ADDITIONAL_AGENT_CONFIGS) {
    rmSync(path.join(state.codexHome, "agents", fileName), { force: true });
  }
}

function removeCodexConfig(state) {
  const current = readTextIfExists(state.configPath);
  if (current.length === 0) return;
  const withoutPlugin = removeTable(current, `plugins."${PLUGIN_REF}"`);
  const next = hasOtherMarketplacePlugins(state, withoutPlugin) ? withoutPlugin : removeTable(withoutPlugin, `marketplaces.${MARKETPLACE_ID}`);
  writeFileSync(state.configPath, normalizeTrailingNewline(next));
}

function backupPluginRoot(pluginRoot) {
  if (!existsSync(pluginRoot)) return { pluginRoot, backupRoot: null };
  const backupRoot = `${pluginRoot}.delete-bak-${process.pid}-${Date.now()}`;
  mkdirSync(path.dirname(backupRoot), { recursive: true });
  renameSync(pluginRoot, backupRoot);
  return { pluginRoot, backupRoot };
}

function restorePluginRoot(backup) {
  if (backup.backupRoot === null || !existsSync(backup.backupRoot)) return;
  rmSync(backup.pluginRoot, { recursive: true, force: true });
  renameSync(backup.backupRoot, backup.pluginRoot);
}

function cleanupPluginBackup(backup) {
  if (backup.backupRoot === null) return;
  rmSync(backup.backupRoot, { recursive: true, force: true });
}

function removeEmptyMarketplaceRoot(state) {
  if (hasOtherMarketplacePlugins(state, readTextIfExists(state.configPath))) return;
  rmSync(state.marketplaceRoot, { recursive: true, force: true });
}

function hasOtherMarketplacePlugins(state, configText) {
  if (hasOtherMarketplacePluginConfig(configText)) return true;

  const pluginsRoot = path.join(state.marketplaceRoot, "plugins");
  try {
    return readdirSync(pluginsRoot, { withFileTypes: true }).some(
      (entry) => entry.isDirectory() && entry.name !== PLUGIN_ID && !entry.name.startsWith(`${PLUGIN_ID}.delete-bak-`)
    );
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function hasOtherMarketplacePluginConfig(configText) {
  if (typeof configText !== "string" || configText.length === 0) return false;
  const pluginTablePattern = /^\[plugins\."([^"]+)"\]/gm;
  let match = pluginTablePattern.exec(configText);
  while (match !== null) {
    const pluginRef = match[1];
    if (pluginRef !== PLUGIN_REF && pluginRef.endsWith(`@${MARKETPLACE_ID}`)) return true;
    match = pluginTablePattern.exec(configText);
  }
  return false;
}

function removeTable(text, tableName) {
  const pattern = new RegExp(`(^|\\n)\\[${escapeRegExp(tableName)}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+]|$)`);
  return text.replace(pattern, "");
}

function normalizeTrailingNewline(text) {
  const trimmed = text.replace(/\n{3,}/g, "\n\n").trim();
  return trimmed.length > 0 ? `${trimmed}\n` : "";
}

function readTextIfExists(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}
