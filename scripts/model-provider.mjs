import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

const DEFAULT_CONFIG_NAME = "config.toml";

export async function fetchAvailableModels(options = {}) {
  const provider = readActiveModelProvider(options);
  if (provider.baseUrl === null) return [];

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return [];

  const url = new URL("models", withTrailingSlash(provider.baseUrl));
  const headers = {};
  const token = provider.bearerToken ?? readBearerTokenFromEnv(provider, options.env ?? process.env);
  if (token !== null) headers.authorization = `Bearer ${token}`;

  const response = await fetchImpl(url, { headers });
  if (!response.ok) return [];

  const payload = await response.json();
  return normalizeModelsPayload(payload);
}

export function readActiveModelProvider(options = {}) {
  const env = options.env ?? process.env;
  const configPath = options.codexConfigPath ?? path.join(env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex"), DEFAULT_CONFIG_NAME);
  const text = readFileSync(configPath, "utf8");
  const activeProvider = readTopLevelTomlString(text, "model_provider");
  if (activeProvider === null) return { id: null, baseUrl: null, bearerToken: null, bearerTokenEnv: null };

  const providerBlock = getTableBlock(text, `model_providers.${activeProvider}`);
  return {
    id: activeProvider,
    baseUrl: readTomlString(providerBlock, "base_url"),
    bearerToken: readTomlString(providerBlock, "experimental_bearer_token"),
    bearerTokenEnv: readTomlString(providerBlock, "env_key") ?? readTomlString(providerBlock, "api_key_env")
  };
}

export function normalizeModelsPayload(payload) {
  const entries = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  const models = [];

  for (const entry of entries) {
    const model = typeof entry === "string" ? entry : entry?.id;
    if (typeof model === "string" && model.trim().length > 0) models.push(model.trim());
  }

  return [...new Set(models)].sort((a, b) => a.localeCompare(b));
}

function readBearerTokenFromEnv(provider, env) {
  if (provider.bearerTokenEnv && env[provider.bearerTokenEnv]?.trim()) return env[provider.bearerTokenEnv].trim();
  if (env.OPENAI_API_KEY?.trim()) return env.OPENAI_API_KEY.trim();
  return null;
}

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function getTableBlock(text, tableName) {
  const pattern = new RegExp(`(^|\\n)\\[${escapeRegExp(tableName)}]\\n([\\s\\S]*?)(?=\\n\\[[^\\n]+]|$)`);
  return pattern.exec(text)?.[2] ?? "";
}

function readTopLevelTomlString(text, key) {
  const firstTable = /^\[[^\n]+]/m.exec(text);
  const topLevel = firstTable === null ? text : text.slice(0, firstTable.index);
  return readTomlString(topLevel, key);
}

function readTomlString(text, key) {
  const match = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, "m").exec(text);
  return match?.[1] ?? null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
