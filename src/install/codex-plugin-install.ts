import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { REMOVED_LFP_AGENT_FILES } from "../model/removed-lfp-agents.js";
import {
  getOpenAiCompatProviderState,
  hasAnyModelProvider,
  readOpenAiCompatProviderConfig,
  upsertOpenAiCompatProvider
} from "../provider/codex-provider-config.js";
import { getPackageRoot } from "../utils/package-root.js";
import { escapeRegExp, getTableBlock } from "../utils/toml-string-utils.js";
import { cleanupInstallSnapshot, createInstallSnapshot, restoreInstallSnapshot } from "./install-transaction.js";
import {
  commitRuntimePromotion,
  normalizeRuntimeEntry,
  prepareRuntimePromotion,
  rollbackRuntimePromotion
} from "./runtime-promotion.js";

export const MARKETPLACE_ID = "islee23520";
export const PLUGIN_ID = "lfp";
export const PLUGIN_REF = `${PLUGIN_ID}@${MARKETPLACE_ID}`;

const DEFAULT_PACKAGE_ROOT = getPackageRoot(import.meta.url);
// LFP installs no agent tomls of its own; it only syncs model fields into the
// existing OMO/LazyCodex agent surface. Legacy LFP-owned agents (oracle,
// prometheus, hephaestus, atlas, sisyphus-junior) are pruned on sync via
// REMOVED_LFP_AGENT_NAMES in removed-lfp-agents.ts.
export const ADDITIONAL_AGENT_CONFIGS = [];
const PROTECTED_UPSTREAM_AGENT_CONFIGS = ["explorer.toml"];
const LAZYCODEX_PLUGIN_REFS = new Set(["omo@sisyphuslabs", "lazycodex-ai"]);

const RUNTIME_ENTRIES = [
  ".codex-plugin",
  "agent-configs",
  { path: "agent-overrides", optional: true },
  "hooks",
  "scripts",
  { path: "dist", optional: true },
  "README.md",
  "package.json"
];

export function getCodexPluginState(options = {}) {
  const provider = getProviderConfig(options);
  const codexHome = getCodexHome(options.env);
  const marketplaceRoot = path.join(codexHome, "local-marketplaces", MARKETPLACE_ID);
  const marketplaceManifestPath = path.join(marketplaceRoot, "marketplace.json");
  const pluginRoot = path.join(marketplaceRoot, "plugins", PLUGIN_ID);
  const agentsRoot = path.join(codexHome, "agents");
  const configPath = path.join(codexHome, "config.toml");
  const configText = readTextIfExists(configPath);
  const marketplaceBlock = getTableBlock(configText, `marketplaces.${MARKETPLACE_ID}`);
  const pluginBlock = getTableBlock(configText, `plugins."${PLUGIN_REF}"`);
  const openAiCompatProvider = getOpenAiCompatProviderState(configText, provider);
  const anyModelProviderConfigured = hasAnyModelProvider(configText);

  return {
    codexHome,
    marketplaceRoot,
    marketplaceManifestPath,
    pluginRoot,
    configPath,
    pluginFilesInstalled: existsSync(path.join(pluginRoot, ".codex-plugin", "plugin.json")),
    marketplaceConfigured:
      marketplaceBlock.includes('source_type = "local"') &&
      marketplaceBlock.includes(`source = ${JSON.stringify(marketplaceRoot)}`),
    pluginEnabled: pluginBlock.includes("enabled = true"),
    openAiCompatProvider,
    anyModelProviderConfigured,
    additionalAgentsInstalled: ADDITIONAL_AGENT_CONFIGS.every((fileName) =>
      existsSync(path.join(agentsRoot, fileName))
    ),
    additionalAgentFiles: [...ADDITIONAL_AGENT_CONFIGS, ...REMOVED_LFP_AGENT_FILES].map((fileName) =>
      path.join(agentsRoot, fileName)
    ),
    removedLfpAgentFiles: REMOVED_LFP_AGENT_FILES.map((fileName) => path.join(agentsRoot, fileName))
  };
}

export function getInstallSmokeState(options = {}) {
  const codexHome = getCodexHome(options.env);
  const agentsRoot = path.join(codexHome, "agents");
  const collisions = ADDITIONAL_AGENT_CONFIGS.filter((fileName) => PROTECTED_UPSTREAM_AGENT_CONFIGS.includes(fileName));

  return {
    explorerPreserved: collisions.length === 0,
    explorerPath: path.join(agentsRoot, "explorer.toml"),
    collisions
  };
}

export function installCodexPlugin(packageRoot, options = {}) {
  const pluginOptions = { ...options, packageRoot };
  const state = getCodexPluginState(pluginOptions);
  mkdirSync(path.dirname(state.pluginRoot), { recursive: true });
  const promotion = prepareRuntimePromotion(packageRoot, state.pluginRoot, RUNTIME_ENTRIES);
  const snapshot = createInstallSnapshot(state);

  try {
    installAdditionalAgents(packageRoot, state);
    removeStaleLfpAgents(state);
    writeMarketplaceManifest(state);
    upsertCodexConfig(state, { installOpenAiCompatProvider: options.installOpenAiCompatProvider === true });
    commitRuntimePromotion(promotion);
    refreshPluginCache(packageRoot, state);
    cleanupInstallSnapshot(snapshot);
    return getCodexPluginState(pluginOptions);
  } catch (error) {
    restoreInstallSnapshot(snapshot);
    cleanupInstallSnapshot(snapshot);
    rollbackRuntimePromotion(promotion);
    throw error;
  }
}

export function getPendingCodexPluginActions(options = {}) {
  const state = getCodexPluginState(options);
  const actions = [];
  if (!state.pluginFilesInstalled) actions.push(`install plugin files to ${state.pluginRoot}`);
  if (!state.marketplaceConfigured) actions.push(`configure marketplace ${MARKETPLACE_ID} in ${state.configPath}`);
  if (!state.pluginEnabled) actions.push(`enable plugin ${PLUGIN_REF} in ${state.configPath}`);
  if (options.installOpenAiCompatProvider === true && state.openAiCompatProvider.status === "missing") {
    actions.push(`configure OpenAI-compatible provider ${state.openAiCompatProvider.id} in ${state.configPath}`);
  }
  if (state.openAiCompatProvider.status === "drifted") {
    actions.push(`resolve drifted OpenAI-compatible provider ${state.openAiCompatProvider.id} in ${state.configPath}`);
  }
  const staleAgentFiles = state.removedLfpAgentFiles.filter((filePath) => existsSync(filePath));
  if (staleAgentFiles.length > 0) {
    actions.push(`remove stale LFP agent files ${staleAgentFiles.join(", ")}`);
  }
  return { state, actions };
}

function installAdditionalAgents(packageRoot, state) {
  if (ADDITIONAL_AGENT_CONFIGS.length === 0) return;
  const sourceRoot = path.join(packageRoot, "agent-configs");
  const targetRoot = path.join(state.codexHome, "agents");
  assertNoProtectedAgentInstallTargets();
  mkdirSync(targetRoot, { recursive: true });
  for (const fileName of ADDITIONAL_AGENT_CONFIGS) {
    cpSync(path.join(sourceRoot, fileName), path.join(targetRoot, fileName));
  }
}

function removeStaleLfpAgents(state) {
  for (const filePath of state.removedLfpAgentFiles) {
    rmSync(filePath, { force: true });
  }
}

function writeMarketplaceManifest(state) {
  mkdirSync(path.dirname(state.marketplaceManifestPath), { recursive: true });
  writeFileSync(
    state.marketplaceManifestPath,
    `${JSON.stringify(
      {
        name: MARKETPLACE_ID,
        plugins: [
          {
            name: PLUGIN_ID,
            source: { source: "local", path: "./plugins/lfp" }
          }
        ]
      },
      null,
      2
    )}\n`
  );
}

function assertNoProtectedAgentInstallTargets() {
  const collisions = ADDITIONAL_AGENT_CONFIGS.filter((fileName) => PROTECTED_UPSTREAM_AGENT_CONFIGS.includes(fileName));
  if (collisions.length === 0) return;
  throw new Error(`LFP agent install would overwrite upstream LazyCodex agents: ${collisions.join(", ")}`);
}

function getCodexHome(env = process.env) {
  return env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
}

function getProviderConfig(options) {
  return options.providerConfig ?? readOpenAiCompatProviderConfig(options.packageRoot ?? DEFAULT_PACKAGE_ROOT);
}

function upsertCodexConfig(state, options = {}) {
  mkdirSync(path.dirname(state.configPath), { recursive: true });
  const current = readTextIfExists(state.configPath);
  const pluginConfig = upsertTable(current, `marketplaces.${MARKETPLACE_ID}`, [
    'source_type = "local"',
    `source = ${JSON.stringify(state.marketplaceRoot)}`
  ]);
  const orderedPluginConfig = ensureLfpPluginAfterLazyCodex(
    upsertTable(pluginConfig, `plugins."${PLUGIN_REF}"`, ["enabled = true"])
  );
  const next =
    options.installOpenAiCompatProvider === true
      ? upsertOpenAiCompatProvider(orderedPluginConfig, state.openAiCompatProvider.config)
      : orderedPluginConfig;
  writeFileSync(state.configPath, next);
}

function ensureLfpPluginAfterLazyCodex(text) {
  const lfpMatch = findTopLevelPluginTable(text, PLUGIN_REF);
  const lazyCodexEnd = findLastLazyCodexPluginEnd(text);
  if (lfpMatch === null || lazyCodexEnd === null || lfpMatch.start > lazyCodexEnd) return text;

  const withoutLfp = `${text.slice(0, lfpMatch.start)}${text.slice(lfpMatch.end)}`;
  const insertAfter = findLastLazyCodexPluginEnd(withoutLfp);
  if (insertAfter === null) return text;

  const before = withoutLfp.slice(0, insertAfter).replace(/\n*$/, "");
  const after = withoutLfp.slice(insertAfter).replace(/^\n*/, "");
  const lfpBlock = lfpMatch.block.trimEnd();
  return `${before}\n\n${lfpBlock}\n${after.length > 0 ? `\n${after}` : ""}`;
}

function findLastLazyCodexPluginEnd(text) {
  let lastEnd = null;
  for (const table of findTopLevelPluginTables(text)) {
    if (isLazyCodexPluginRef(table.pluginRef)) lastEnd = table.end;
  }
  return lastEnd;
}

function findTopLevelPluginTable(text, pluginRef) {
  for (const table of findTopLevelPluginTables(text)) {
    if (table.pluginRef === pluginRef) return table;
  }
  return null;
}

function findTopLevelPluginTables(text) {
  const pattern = /(^|\n)(\[plugins\."([^"]+)"\]\n[\s\S]*?)(?=\n\[[^\n]+]|$)/g;
  const tables = [];
  for (const match of text.matchAll(pattern)) {
    const separator = match[1];
    const block = match[2];
    const start = match.index + separator.length;
    tables.push({
      pluginRef: match[3],
      block,
      start,
      end: start + block.length
    });
  }
  return tables;
}

function isLazyCodexPluginRef(pluginRef) {
  return LAZYCODEX_PLUGIN_REFS.has(pluginRef) || pluginRef.includes("lazycodex");
}

function upsertTable(text, tableName, lines) {
  const block = `[${tableName}]\n${lines.join("\n")}\n`;
  const pattern = new RegExp(`(^|\\n)\\[${escapeRegExp(tableName)}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`);
  if (pattern.test(text)) return text.replace(pattern, `$1${block.trimEnd()}`);
  const separator = text.length > 0 && !text.endsWith("\n") ? "\n\n" : text.length > 0 ? "\n" : "";
  return `${text}${separator}${block}`;
}

function readTextIfExists(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function refreshPluginCache(packageRoot, state) {
  const version = readPluginVersion(packageRoot);
  if (version === null) return;
  const cacheDir = path.join(state.codexHome, "plugins", "cache", MARKETPLACE_ID, PLUGIN_ID, version);
  if (!existsSync(cacheDir)) return;
  for (const entry of RUNTIME_ENTRIES) {
    const item = normalizeRuntimeEntry(entry);
    const source = path.join(packageRoot, item.path);
    if (item.optional && !existsSync(source)) continue;
    rmSync(path.join(cacheDir, item.path), { recursive: true, force: true });
    cpSync(source, path.join(cacheDir, item.path), { recursive: true });
  }
}

function readPluginVersion(packageRoot) {
  try {
    return JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"))?.version ?? null;
  } catch {
    return null;
  }
}
