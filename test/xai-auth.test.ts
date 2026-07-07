import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  clearXaiAuth,
  getXaiAuthStatus,
  importGrokXaiAuth,
  readXaiAuth,
  refreshXaiOAuth,
  resolveCodexHostAuthPath,
  resolveGrokHostAuthPath,
  resolveXaiAuthPath,
  writeXaiApiKey,
  writeXaiOAuth
} from "../src/xai/xai-auth.ts";

test("given codex home when resolving xai auth path then uses xai oauth state", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-auth-"));
  try {
    const codexHome = path.join(root, "codex");
    const authPath = resolveXaiAuthPath({ env: { CODEX_HOME: codexHome, HOME: root } });

    assert.equal(authPath, path.join(codexHome, "xai-oauth", "auth.json"));
    assert.equal(
      resolveCodexHostAuthPath({ env: { CODEX_HOME: codexHome, HOME: root } }),
      path.join(codexHome, "auth.json")
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given grok host xai oidc when importing then writes lfp xai oauth copy", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-auth-"));
  try {
    const codexHome = path.join(root, "codex");
    const env = { CODEX_HOME: codexHome, HOME: root };
    mkdirSync(path.dirname(resolveGrokHostAuthPath({ env })), { recursive: true });
    writeFileSync(
      resolveGrokHostAuthPath({ env }),
      JSON.stringify({
        "https://auth.x.ai::custom-grok-client": {
          auth_mode: "oidc",
          oidc_issuer: "https://auth.x.ai",
          oidc_client_id: "custom-grok-client",
          key: "grok-access",
          refresh_token: "grok-refresh",
          expires_at: new Date(Date.now() + 3600_000).toISOString()
        }
      })
    );

    const result = importGrokXaiAuth({ env });
    const imported = readXaiAuth(resolveXaiAuthPath({ env }));

    assert.equal(result.imported, true);
    assert.equal(result.mode, "oauth");
    assert.equal(imported?.access, "grok-access");
    assert.equal(imported?.refresh, "grok-refresh");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given valid lfp oauth and expired grok oauth when importing then preserves lfp auth", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-auth-"));
  try {
    const codexHome = path.join(root, "codex");
    const env = { CODEX_HOME: codexHome, HOME: root };
    const authPath = resolveXaiAuthPath({ env });
    writeXaiOAuth(authPath, {
      access: "valid-access",
      refresh: "valid-refresh",
      expires: Date.now() + 3600_000,
      clientId: "valid-client"
    });
    mkdirSync(path.dirname(resolveGrokHostAuthPath({ env })), { recursive: true });
    writeFileSync(
      resolveGrokHostAuthPath({ env }),
      JSON.stringify({
        "https://auth.x.ai::stale-client": {
          auth_mode: "oidc",
          oidc_issuer: "https://auth.x.ai",
          oidc_client_id: "stale-client",
          key: "stale-access",
          refresh_token: "stale-refresh",
          expires_at: new Date(Date.now() - 3600_000).toISOString()
        }
      })
    );

    const result = importGrokXaiAuth({ env });
    const preserved = readXaiAuth(authPath);

    assert.equal(result.imported, false);
    assert.equal(result.preserved, true);
    assert.equal(preserved?.access, "valid-access");
    assert.equal(preserved?.refresh, "valid-refresh");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given only expired grok oauth when importing then rejects without writing auth", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-auth-"));
  try {
    const codexHome = path.join(root, "codex");
    const env = { CODEX_HOME: codexHome, HOME: root };
    mkdirSync(path.dirname(resolveGrokHostAuthPath({ env })), { recursive: true });
    writeFileSync(
      resolveGrokHostAuthPath({ env }),
      JSON.stringify({
        "https://auth.x.ai::stale-client": {
          auth_mode: "oidc",
          oidc_issuer: "https://auth.x.ai",
          oidc_client_id: "stale-client",
          key: "stale-access",
          refresh_token: "stale-refresh",
          expires_at: new Date(Date.now() - 3600_000).toISOString()
        }
      })
    );

    const result = importGrokXaiAuth({ env });

    assert.equal(result.imported, false);
    assert.equal(result.reason, "expired-grok-auth");
    assert.equal(readXaiAuth(resolveXaiAuthPath({ env })), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given api key when writing xai auth then it does not touch codex host auth", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-auth-"));
  try {
    const codexHome = path.join(root, "codex");
    const env = { CODEX_HOME: codexHome, HOME: root };
    const authPath = resolveXaiAuthPath({ env });

    writeXaiApiKey(authPath, "sk-test-xai");
    const parsed = readXaiAuth(authPath);

    assert.equal(parsed?.apiKey, "sk-test-xai");
    assert.equal(JSON.parse(readFileSync(authPath, "utf8")).auth_mode, "api_key");
    assert.equal(existsSync(resolveCodexHostAuthPath({ env })), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given dedicated auth and codex oidc when checking status then dedicated auth wins", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-auth-"));
  try {
    const codexHome = path.join(root, "codex");
    const env = { CODEX_HOME: codexHome, HOME: root };
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(
      resolveCodexHostAuthPath({ env }),
      JSON.stringify({
        "https://auth.x.ai::grok-cli": {
          auth_mode: "oidc",
          oidc_issuer: "https://auth.x.ai",
          oidc_client_id: "grok-cli",
          key: "host-access",
          refresh_token: "host-refresh",
          expires_at: new Date(Date.now() + 3600_000).toISOString()
        }
      })
    );
    writeXaiApiKey(resolveXaiAuthPath({ env }), "sk-dedicated");

    const status = getXaiAuthStatus({ env });

    assert.equal(status.ok, true);
    assert.equal(status.mode, "api_key");
    assert.equal(status.provider, "lfp-xai");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given dedicated auth when clearing then only dedicated auth is removed", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-auth-"));
  try {
    const codexHome = path.join(root, "codex");
    const env = { CODEX_HOME: codexHome, HOME: root };
    const authPath = resolveXaiAuthPath({ env });
    writeXaiApiKey(authPath, "sk-test");

    assert.equal(clearXaiAuth(authPath), true);
    assert.equal(readXaiAuth(authPath), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given oauth auth when refreshing then writes new access token", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-auth-"));
  try {
    const codexHome = path.join(root, "codex");
    const env = { CODEX_HOME: codexHome, HOME: root };
    const authPath = resolveXaiAuthPath({ env });
    writeXaiOAuth(authPath, {
      access: "old-access",
      refresh: "old-refresh",
      expires: Date.now() - 1000,
      clientId: "custom-client"
    });

    const result = await refreshXaiOAuth({
      env,
      fetch: async (_url, init) => {
        assert.equal(String(init.body).includes("client_id=custom-client"), true);
        return {
          ok: true,
          json: async () => ({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 })
        };
      }
    });
    const refreshed = readXaiAuth(authPath);

    assert.equal(result.refreshed, true);
    assert.equal(refreshed?.access, "new-access");
    assert.equal(refreshed?.refresh, "new-refresh");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given valid oauth auth when refreshing then skips network refresh", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-auth-"));
  try {
    const codexHome = path.join(root, "codex");
    const env = { CODEX_HOME: codexHome, HOME: root };
    const authPath = resolveXaiAuthPath({ env });
    writeXaiOAuth(authPath, {
      access: "valid-access",
      refresh: "valid-refresh",
      expires: Date.now() + 3600_000,
      clientId: "custom-client"
    });

    const result = await refreshXaiOAuth({
      env,
      fetch: async () => {
        throw new Error("refresh should not call network for valid auth");
      }
    });
    const preserved = readXaiAuth(authPath);

    assert.equal(result.refreshed, false);
    assert.equal(result.mode, "oauth");
    assert.equal(preserved?.access, "valid-access");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
