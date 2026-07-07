import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const XAI_AUTH_FILE_ENV = "LFP_XAI_AUTH_FILE";
export const GROK_XAI_AUTH_FILE_ENV = "LFP_GROK_XAI_AUTH_FILE";
export const XAI_AUTH_BASENAME = "auth.json";
export const XAI_AUTH_DIRNAME = "xai-oauth";
export const GROK_XAI_AUTH_BASENAME = "xai-grok-mcp-auth.json";
export const XAI_OAUTH_ISSUER = "https://auth.x.ai";
export const XAI_OAUTH_CLIENT_ID = "grok-cli";
export const XAI_OAUTH_TOKEN_URL = `${XAI_OAUTH_ISSUER}/oauth2/token`;

export class XaiAuthUsageError extends Error {
  readonly exitCode = 2;
}

export function resolveXaiAuthPath(options = {}) {
  const env = options.env ?? process.env;
  const explicit = env[XAI_AUTH_FILE_ENV]?.trim();
  if (explicit !== undefined && explicit.length > 0) return explicit;
  return path.join(resolveCodexHome(options), XAI_AUTH_DIRNAME, XAI_AUTH_BASENAME);
}

export function resolveCodexHostAuthPath(options = {}) {
  return path.join(resolveCodexHome(options), "auth.json");
}

export function resolveGrokDedicatedXaiAuthPath(options = {}) {
  const env = options.env ?? process.env;
  const explicit = env[GROK_XAI_AUTH_FILE_ENV]?.trim();
  if (explicit !== undefined && explicit.length > 0) return explicit;
  return path.join(resolveHome(options), ".grok", GROK_XAI_AUTH_BASENAME);
}

export function resolveGrokHostAuthPath(options = {}) {
  return path.join(resolveHome(options), ".grok", "auth.json");
}

export function readXaiAuth(filePath) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }

  try {
    const data = JSON.parse(text);
    if (!isRecord(data)) return null;
    if (typeof data.apiKey === "string" && data.apiKey.trim().length > 0) {
      return {
        provider: "lfp-xai",
        access: data.apiKey.trim(),
        refresh: "",
        expires: Number.MAX_SAFE_INTEGER,
        tokenEndpoint: XAI_OAUTH_TOKEN_URL,
        tokenType: "Bearer",
        apiKey: data.apiKey.trim()
      };
    }
    if (typeof data.access === "string" && typeof data.refresh === "string" && typeof data.expires === "number") {
      return {
        provider: typeof data.provider === "string" ? data.provider : "xai-oauth",
        access: data.access,
        refresh: data.refresh,
        expires: data.expires,
        tokenEndpoint: typeof data.tokenEndpoint === "string" ? data.tokenEndpoint : XAI_OAUTH_TOKEN_URL,
        tokenType: typeof data.tokenType === "string" ? data.tokenType : "Bearer",
        clientId: typeof data.clientId === "string" ? data.clientId : XAI_OAUTH_CLIENT_ID
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeXaiApiKey(filePath, apiKey) {
  const trimmed = apiKey.trim();
  if (trimmed.length === 0) throw new XaiAuthUsageError("API key must be non-empty");
  const body = {
    provider: "lfp-xai",
    auth_mode: "api_key",
    apiKey: trimmed,
    updated_at: new Date().toISOString()
  };
  writeAuthFile(filePath, `${JSON.stringify(body, null, 2)}\n`);
}

export function writeXaiOAuth(filePath, auth) {
  const body = {
    provider: "xai-oauth",
    auth_mode: "oauth",
    access: auth.access,
    refresh: auth.refresh,
    expires: auth.expires,
    tokenEndpoint: auth.tokenEndpoint ?? XAI_OAUTH_TOKEN_URL,
    tokenType: auth.tokenType ?? "Bearer",
    clientId: auth.clientId ?? XAI_OAUTH_CLIENT_ID,
    imported_from: auth.importedFrom,
    updated_at: new Date().toISOString()
  };
  writeAuthFile(filePath, `${JSON.stringify(body, null, 2)}\n`);
}

export function clearXaiAuth(filePath) {
  if (!existsSync(filePath)) return false;
  rmSync(filePath, { force: true });
  return true;
}

export function readCodexHostOidcForXai(filePath) {
  return readHostOidcForXai(filePath);
}

export function readHostOidcForXai(filePath) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }

  try {
    const data = JSON.parse(text);
    if (!isRecord(data)) return null;
    for (const value of Object.values(data)) {
      if (!isRecord(value)) continue;
      if (value.auth_mode !== "oidc" || value.oidc_issuer !== XAI_OAUTH_ISSUER) continue;
      const access = typeof value.key === "string" ? value.key : "";
      const refresh = typeof value.refresh_token === "string" ? value.refresh_token : "";
      const expires = typeof value.expires_at === "string" ? Date.parse(value.expires_at) : Number.NaN;
      const clientId = typeof value.oidc_client_id === "string" ? value.oidc_client_id : XAI_OAUTH_CLIENT_ID;
      if (access.length > 0 && refresh.length > 0 && !Number.isNaN(expires)) {
        return { access, refresh, expires, clientId };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function writeAuthFile(filePath, body) {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, body, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, filePath);
  chmodSync(filePath, 0o600);
}

function resolveCodexHome(options) {
  const env = options.env ?? process.env;
  return env.CODEX_HOME?.trim() || path.join(resolveHome(options), ".codex");
}

function resolveHome(options) {
  const env = options.env ?? process.env;
  return env.HOME?.trim() || os.homedir();
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error) {
  return typeof error === "object" && error !== null && "code" in error;
}
