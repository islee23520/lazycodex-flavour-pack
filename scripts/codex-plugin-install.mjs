import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getOpenAiCompatProviderState,
  readOpenAiCompatProviderConfig,
  upsertOpenAiCompatProvider
} from "./codex-provider-config.mjs";

export const MARKETPLACE_ID = "linalab";
export const PLUGIN_ID = "lfp";
export const PLUGIN_REF = `${PLUGIN_ID}@${MARKETPLACE_ID}`;

const DEFAULT_PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ADDITIONAL_AGENT_CONFIGS = ["visual-engineering.toml", "visual-looker.toml"];
const PROTECTED_UPSTREAM_AGENT_CONFIGS = ["explorer.toml"];
const VISUAL_AGENT_EXPECTATIONS = [
  { name: "visual-engineering", fileName: "visual-engineering.toml", model: "gemini-3.1-pro-preview" },
  { name: "visual-looker", fileName: "visual-looker.toml", model: "gemini-3.1-pro-preview" }
];

const RUNTIME_ENTRIES = [
  ".codex-plugin",
  "agent-configs",
  "agent-overrides",
  "hooks",
  "scripts",
  "README.md",
  "package.json"
];

export function getCodexPluginState(options = {}) {
  const provider = getProviderConfig(options);
  const codexHome = getCodexHome(options.env);
  const marketplaceRoot = path.join(codexHome, "local-marketplaces", MARKETPLACE_ID);
  const pluginRoot = path.join(marketplaceRoot, "plugins", PLUGIN_ID);
  const agentsRoot = path.join(codexHome, "agents");
  const configPath = path.join(codexHome, "config.toml");
  const configText = readTextIfExists(configPath);
  const marketplaceBlock = getTableBlock(configText, `marketplaces.${MARKETPLACE_ID}`);
  const pluginBlock = getTableBlock(configText, `plugins."${PLUGIN_REF}"`);
  const openAiCompatProvider = getOpenAiCompatProviderState(configText, provider);

  return {
    codexHome,
    marketplaceRoot,
    pluginRoot,
    configPath,
    pluginFilesInstalled: existsSync(path.join(pluginRoot, ".codex-plugin", "plugin.json")),
    marketplaceConfigured:
      marketplaceBlock.includes('source_type = "local"') &&
      marketplaceBlock.includes(`source = ${JSON.stringify(marketplaceRoot)}`),
    pluginEnabled: pluginBlock.includes("enabled = true"),
    openAiCompatProvider,
    additionalAgentsInstalled: ADDITIONAL_AGENT_CONFIGS.every((fileName) =>
      existsSync(path.join(agentsRoot, fileName))
    ),
    additionalAgentFiles: ADDITIONAL_AGENT_CONFIGS.map((fileName) => path.join(agentsRoot, fileName))
  };
}

export function getVisualSmokeState(options = {}) {
  const codexHome = getCodexHome(options.env);
  const agentsRoot = path.join(codexHome, "agents");
  const checks = VISUAL_AGENT_EXPECTATIONS.map((expected) => {
    const filePath = path.join(agentsRoot, expected.fileName);
    const text = readTextIfExists(filePath);
    if (text.length === 0) return { ...expected, filePath, status: "missing" };

    const actualModel = readTomlString(text, "model");
    if (actualModel === null) return { ...expected, filePath, status: "malformed", actualModel: null };
    if (actualModel !== expected.model) {
      return { ...expected, filePath, status: "model-mismatch", actualModel };
    }

    return { ...expected, filePath, status: "verified", actualModel };
  });

  return {
    verified: checks.every((check) => check.status === "verified"),
    checks
  };
}

export function getInstallSmokeState(options = {}) {
  const codexHome = getCodexHome(options.env);
  const agentsRoot = path.join(codexHome, "agents");
  const collisions = ADDITIONAL_AGENT_CONFIGS.filter((fileName) =>
    PROTECTED_UPSTREAM_AGENT_CONFIGS.includes(fileName)
  );

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
  rmSync(state.pluginRoot, { recursive: true, force: true });
  mkdirSync(state.pluginRoot, { recursive: true });

  for (const entry of RUNTIME_ENTRIES) {
    cpSync(path.join(packageRoot, entry), path.join(state.pluginRoot, entry), { recursive: true });
  }

  installAdditionalAgents(packageRoot, state);
  upsertCodexConfig(state);
  return getCodexPluginState(pluginOptions);
}

export function getPendingCodexPluginActions(options = {}) {
  const state = getCodexPluginState(options);
  const actions = [];
  if (!state.pluginFilesInstalled) actions.push(`install plugin files to ${state.pluginRoot}`);
  if (!state.additionalAgentsInstalled) actions.push(`install LFP agents to ${path.join(state.codexHome, "agents")}`);
  if (!state.marketplaceConfigured) actions.push(`configure marketplace ${MARKETPLACE_ID} in ${state.configPath}`);
  if (!state.pluginEnabled) actions.push(`enable plugin ${PLUGIN_REF} in ${state.configPath}`);
  if (state.openAiCompatProvider.status === "missing") {
    actions.push(`configure OpenAI-compatible provider ${state.openAiCompatProvider.id} in ${state.configPath}`);
  }
  if (state.openAiCompatProvider.status === "drifted") {
    actions.push(`resolve drifted OpenAI-compatible provider ${state.openAiCompatProvider.id} in ${state.configPath}`);
  }
  return { state, actions };
}

function installAdditionalAgents(packageRoot, state) {
  const sourceRoot = path.join(packageRoot, "agent-configs");
  const targetRoot = path.join(state.codexHome, "agents");
  assertNoProtectedAgentInstallTargets();
  mkdirSync(targetRoot, { recursive: true });
  for (const fileName of ADDITIONAL_AGENT_CONFIGS) {
    cpSync(path.join(sourceRoot, fileName), path.join(targetRoot, fileName));
  }
}

function assertNoProtectedAgentInstallTargets() {
  const collisions = ADDITIONAL_AGENT_CONFIGS.filter((fileName) =>
    PROTECTED_UPSTREAM_AGENT_CONFIGS.includes(fileName)
  );
  if (collisions.length === 0) return;
  throw new Error(`LFP agent install would overwrite upstream LazyCodex agents: ${collisions.join(", ")}`);
}

function getCodexHome(env = process.env) {
  return env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
}

function getProviderConfig(options) {
  return options.providerConfig ?? readOpenAiCompatProviderConfig(options.packageRoot ?? DEFAULT_PACKAGE_ROOT);
}

function upsertCodexConfig(state) {
  mkdirSync(path.dirname(state.configPath), { recursive: true });
  const current = readTextIfExists(state.configPath);
  const pluginConfig = upsertTable(
    upsertTable(current, `marketplaces.${MARKETPLACE_ID}`, [
      'source_type = "local"',
      `source = ${JSON.stringify(state.marketplaceRoot)}`
    ]),
    `plugins."${PLUGIN_REF}"`,
    ["enabled = true"]
  );
  const next = upsertOpenAiCompatProvider(pluginConfig, state.openAiCompatProvider.config);
  writeFileSync(state.configPath, next);
}

function upsertTable(text, tableName, lines) {
  const block = `[${tableName}]\n${lines.join("\n")}\n`;
  const pattern = new RegExp(`(^|\\n)\\[${escapeRegExp(tableName)}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`);
  if (pattern.test(text)) return text.replace(pattern, `$1${block.trimEnd()}`);
  const separator = text.length > 0 && !text.endsWith("\n") ? "\n\n" : text.length > 0 ? "\n" : "";
  return `${text}${separator}${block}`;
}

function getTableBlock(text, tableName) {
  const pattern = new RegExp(`(^|\\n)\\[${escapeRegExp(tableName)}\\]\\n([\\s\\S]*?)(?=\\n\\[[^\\n]+\\]|$)`);
  return pattern.exec(text)?.[2] ?? "";
}

function readTextIfExists(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function readTomlString(text, key) {
  const match = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, "m").exec(text);
  return match?.[1] ?? null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
