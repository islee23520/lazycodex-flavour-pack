export {
  clearXaiAuth,
  GROK_XAI_AUTH_BASENAME,
  GROK_XAI_AUTH_FILE_ENV,
  readCodexHostOidcForXai,
  readHostOidcForXai,
  readXaiAuth,
  resolveCodexHostAuthPath,
  resolveGrokDedicatedXaiAuthPath,
  resolveGrokHostAuthPath,
  resolveXaiAuthPath,
  writeXaiApiKey,
  writeXaiOAuth,
  XAI_AUTH_BASENAME,
  XAI_AUTH_DIRNAME,
  XAI_AUTH_FILE_ENV,
  XAI_OAUTH_CLIENT_ID,
  XAI_OAUTH_ISSUER,
  XAI_OAUTH_TOKEN_URL,
  XaiAuthUsageError
} from "./xai-auth-store.js";

import {
  readHostOidcForXai,
  readXaiAuth,
  resolveCodexHostAuthPath,
  resolveGrokDedicatedXaiAuthPath,
  resolveGrokHostAuthPath,
  resolveXaiAuthPath,
  writeXaiApiKey,
  writeXaiOAuth,
  XAI_OAUTH_CLIENT_ID,
  XAI_OAUTH_TOKEN_URL,
  XaiAuthUsageError
} from "./xai-auth-store.js";

export function refreshXaiOAuth(options = {}) {
  return refreshXaiOAuthAsync(options);
}

export async function refreshXaiOAuthAsync(options = {}) {
  const authFile = resolveXaiAuthPath(options);
  const auth = readXaiAuth(authFile);
  if (auth === null) throw new XaiAuthUsageError("No xAI auth file to refresh. Run: lfp xai auth import-grok");
  if (auth.apiKey !== undefined) return { refreshed: false, mode: "api_key", authFile, expiresAt: null };
  if (auth.expires > Date.now()) {
    return { refreshed: false, mode: "oauth", authFile, expiresAt: new Date(auth.expires).toISOString() };
  }
  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(auth.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "lfp-xai-oauth/0.0.0" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: auth.clientId ?? XAI_OAUTH_CLIENT_ID,
      refresh_token: auth.refresh
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.access_token !== "string") throw new Error("xAI OAuth refresh failed");
  const refreshed = {
    access: data.access_token,
    refresh: typeof data.refresh_token === "string" ? data.refresh_token : auth.refresh,
    expires: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    tokenEndpoint: auth.tokenEndpoint,
    tokenType: auth.tokenType,
    clientId: auth.clientId
  };
  writeXaiOAuth(authFile, refreshed);
  return { refreshed: true, mode: "oauth", authFile, expiresAt: new Date(refreshed.expires).toISOString() };
}

export function importGrokXaiAuth(options = {}) {
  const targetPath = resolveXaiAuthPath(options);
  const dedicatedPath = resolveGrokDedicatedXaiAuthPath(options);
  const dedicated = readXaiAuth(dedicatedPath);
  if (dedicated !== null) {
    const result = writeImportedGrokXaiAuth(targetPath, { ...dedicated, importedFrom: dedicatedPath });
    return importResult(result, dedicatedPath, targetPath, dedicated.apiKey === undefined ? "oauth" : "api_key");
  }

  const hostPath = resolveGrokHostAuthPath(options);
  const oidc = readHostOidcForXai(hostPath);
  if (oidc !== null) {
    const result = writeImportedGrokXaiAuth(targetPath, {
      ...oidc,
      tokenEndpoint: XAI_OAUTH_TOKEN_URL,
      tokenType: "Bearer",
      importedFrom: hostPath
    });
    return importResult(result, hostPath, targetPath, "oauth");
  }

  return { imported: false, preserved: false, reason: "missing-grok-auth", source: null, targetPath, mode: "none" };
}

export function writeImportedGrokXaiAuth(targetPath, auth) {
  const current = readXaiAuth(targetPath);
  if (current !== null && current.expires > Date.now() && auth.apiKey === undefined && auth.expires <= Date.now()) {
    return { imported: false, preserved: true, reason: "preserved-valid-existing-auth" };
  }
  if (auth.apiKey === undefined && auth.expires <= Date.now()) {
    return { imported: false, preserved: false, reason: "expired-grok-auth" };
  }
  if (auth.apiKey !== undefined) writeXaiApiKey(targetPath, auth.apiKey);
  else writeXaiOAuth(targetPath, auth);
  return { imported: true, preserved: false, reason: null };
}

export function getXaiAuthStatus(options = {}) {
  const authFile = resolveXaiAuthPath(options);
  const dedicated = readXaiAuth(authFile);
  if (dedicated !== null) return statusForDedicatedAuth(authFile, dedicated);

  const env = options.env ?? process.env;
  const envKey = env.XAI_API_KEY?.trim();
  if (envKey !== undefined && envKey.length > 0) {
    return {
      ok: true,
      mode: "api_key",
      authFile,
      expiresAt: null,
      provider: "env",
      message: "Using XAI_API_KEY from environment. No dedicated file has been written."
    };
  }

  const codexOidc = readHostOidcForXai(resolveCodexHostAuthPath(options));
  if (codexOidc !== null) return statusForCodexHostAuth(authFile, codexOidc);
  return {
    ok: false,
    mode: "none",
    authFile,
    expiresAt: null,
    provider: null,
    message: "No xAI credentials. Run: lfp xai auth set-api-key --api-key <key>."
  };
}

function importResult(result, source, targetPath, mode) {
  return { imported: result.imported, preserved: result.preserved, reason: result.reason, source, targetPath, mode };
}

function statusForDedicatedAuth(authFile, auth) {
  if (auth.apiKey !== undefined) {
    return {
      ok: true,
      mode: "api_key",
      authFile,
      expiresAt: null,
      provider: auth.provider,
      message: "Using dedicated xAI API key. Codex auth.json is not modified."
    };
  }
  const expired = auth.expires <= Date.now();
  return {
    ok: !expired,
    mode: "oauth",
    authFile,
    expiresAt: new Date(auth.expires).toISOString(),
    provider: auth.provider,
    message: expired
      ? "Dedicated xAI OAuth tokens are expired. Run grok login --oauth, then lfp xai auth import-grok."
      : "Using dedicated xAI OAuth store. Codex auth.json is not modified."
  };
}

function statusForCodexHostAuth(authFile, auth) {
  const expired = auth.expires <= Date.now();
  return {
    ok: !expired,
    mode: "codex_oidc_readonly",
    authFile,
    expiresAt: new Date(auth.expires).toISOString(),
    provider: "xai-oauth",
    message: expired
      ? "No dedicated xAI auth file; Codex host xAI OIDC is expired."
      : "No dedicated file; using read-only Codex host auth.json. Host auth is never modified."
  };
}
