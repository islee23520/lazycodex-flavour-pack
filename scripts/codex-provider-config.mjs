import { readFileSync } from "node:fs";
import path from "node:path";
import { escapeRegExp, getTableBlock, readTomlString, readTopLevelTomlString } from "./toml-string-utils.mjs";

export const OPENAI_COMPAT_PROVIDER_CONFIG = "codex-openai-compat-provider.toml";

export function readOpenAiCompatProviderConfig(packageRoot) {
  const filePath = path.join(packageRoot, "agent-configs", OPENAI_COMPAT_PROVIDER_CONFIG);
  const text = readFileSync(filePath, "utf8");
  return parseOpenAiCompatProviderConfig(text, filePath);
}

export function getOpenAiCompatProviderState(text, provider) {
  const providerBlock = getTableBlock(text, `model_providers.${provider.id}`);
  const activeProvider = readTopLevelTomlString(text, "model_provider");
  const status = getProviderStatus(providerBlock, provider);

  return {
    id: provider.id,
    config: provider,
    status,
    activeProvider,
    activeStatus: getActiveProviderStatus(activeProvider, provider)
  };
}

export function upsertOpenAiCompatProvider(text, provider) {
  const state = getOpenAiCompatProviderState(text, provider);
  if (state.status === "drifted") return text;

  const withActiveProvider =
    state.activeStatus === "missing" ? upsertTopLevelString(text, "model_provider", provider.id) : text;

  if (state.status === "configured") return withActiveProvider;

  const lines = [
    `base_url = ${JSON.stringify(provider.baseUrl)}`,
    `wire_api = ${JSON.stringify(provider.wireApi)}`,
    `requires_openai_auth = ${provider.requiresOpenAiAuth}`
  ];
  if (provider.envKey) lines.push(`env_key = ${JSON.stringify(provider.envKey)}`);
  return upsertTable(withActiveProvider, `model_providers.${provider.id}`, lines);
}

export function hasAnyModelProvider(text) {
  return readTopLevelTomlString(text, "model_provider") !== null || /^\[model_providers\.[^\n\]]+]/m.test(text);
}

function parseOpenAiCompatProviderConfig(text, filePath) {
  const block = getTableBlock(text, "provider");
  const provider = {
    id: readTomlString(block, "id"),
    baseUrl: readTomlString(block, "base_url"),
    wireApi: readTomlString(block, "wire_api"),
    requiresOpenAiAuth: readTomlBoolean(block, "requires_openai_auth")
  };

  for (const [key, value] of Object.entries(provider)) {
    if (value === null) throw new Error(`Provider config ${filePath} is missing ${key}`);
  }

  return provider;
}

function getProviderStatus(providerBlock, provider) {
  if (providerBlock.length === 0) return "missing";
  if (
    readTomlString(providerBlock, "base_url") === provider.baseUrl &&
    readTomlString(providerBlock, "wire_api") === provider.wireApi &&
    readTomlBoolean(providerBlock, "requires_openai_auth") === provider.requiresOpenAiAuth
  ) {
    if (provider.envKey && readTomlString(providerBlock, "env_key") !== provider.envKey) return "drifted";
    return "configured";
  }
  return "drifted";
}

function getActiveProviderStatus(activeProvider, provider) {
  if (activeProvider === null) return "missing";
  if (activeProvider === provider.id) return "configured";
  return "user-managed";
}

function upsertTopLevelString(text, key, value) {
  const line = `${key} = ${JSON.stringify(value)}`;
  const pattern = new RegExp(`(^|\\n)${escapeRegExp(key)}\\s*=\\s*"[^"]*"\\s*(?=\\n|$)`);
  if (pattern.test(text)) return text.replace(pattern, `$1${line}`);
  const separator = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
  return `${line}\n${separator}${text}`;
}

function upsertTable(text, tableName, lines) {
  const block = `[${tableName}]\n${lines.join("\n")}\n`;
  const pattern = new RegExp(`(^|\\n)\\[${escapeRegExp(tableName)}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`);
  if (pattern.test(text)) return text.replace(pattern, `$1${block.trimEnd()}`);
  const separator = text.length > 0 && !text.endsWith("\n") ? "\n\n" : text.length > 0 ? "\n" : "";
  return `${text}${separator}${block}`;
}

function readTomlBoolean(text, key) {
  const match = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*(true|false)\\s*$`, "m").exec(text);
  if (match === null) return null;
  return match[1] === "true";
}
