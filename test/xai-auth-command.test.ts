import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { dispatchXaiAuthCommand } from "../src/cli/xai-auth-command.ts";
import {
  readXaiAuth,
  resolveCodexHostAuthPath,
  resolveGrokHostAuthPath,
  resolveXaiAuthPath
} from "../src/xai/xai-auth.ts";

test("given xai auth set-api-key when json is requested then writes xai oauth auth", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-cli-"));
  try {
    const env = { CODEX_HOME: path.join(root, "codex"), HOME: root };
    const result = await dispatchXaiAuthCommand(["set-api-key", "--api-key", "sk-test-cli", "--json"], { env });
    const authPath = resolveXaiAuthPath({ env });

    assert.equal(result.ok, true);
    assert.equal(result.status, "xai_auth_saved");
    assert.equal(result.authFile, authPath);
    assert.equal(readXaiAuth(authPath)?.apiKey, "sk-test-cli");
    assert.equal(existsSync(resolveCodexHostAuthPath({ env })), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given xai auth import-grok when grok has xai oidc then copies credentials without touching grok", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-cli-"));
  try {
    const env = { CODEX_HOME: path.join(root, "codex"), HOME: root };
    mkdirSync(path.dirname(resolveGrokHostAuthPath({ env })), { recursive: true });
    writeFileSync(
      resolveGrokHostAuthPath({ env }),
      JSON.stringify({
        "https://auth.x.ai::custom-client": {
          auth_mode: "oidc",
          oidc_issuer: "https://auth.x.ai",
          oidc_client_id: "custom-client",
          key: "host-access",
          refresh_token: "host-refresh",
          expires_at: new Date(Date.now() + 3600_000).toISOString()
        }
      })
    );

    const result = await dispatchXaiAuthCommand(["import-grok", "--json"], { env });
    const authPath = resolveXaiAuthPath({ env });

    assert.equal(result.ok, true);
    assert.equal(result.status, "xai_auth_imported");
    assert.equal(result.authFile, authPath);
    assert.equal(readXaiAuth(authPath)?.access, "host-access");
    assert.equal(result.grokHostAuthUntouched, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given xai auth status when json is requested then reports no mcp registration", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-xai-cli-"));
  try {
    const env = { CODEX_HOME: path.join(root, "codex"), HOME: root };
    const result = await dispatchXaiAuthCommand(["status", "--json"], { env });

    assert.equal(result.status, "xai_auth_status");
    assert.equal(result.codexHostAuthUntouched, true);
    assert.equal(result.mcpRegistered, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
