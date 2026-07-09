import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  getXaiMcpConsentPath,
  getXaiMcpPluginStatus,
  readXaiMcpConsent,
  saveXaiMcpConsent,
  shouldPromptXaiMcpPlugin
} from "../src/install/xai-mcp-plugin.js";

function makeTempEnv() {
  const codexHome = mkdtempSync(path.join(tmpdir(), "lfp-xai-test-"));
  return { CODEX_HOME: codexHome };
}

test("given no consent file when reading consent then returns null", () => {
  const env = makeTempEnv();
  assert.equal(readXaiMcpConsent({ env }), null);
});

test("given yes consent when reading consent then returns true", () => {
  const env = makeTempEnv();
  saveXaiMcpConsent(true, { env });
  assert.equal(readXaiMcpConsent({ env }), true);
});

test("given no consent when reading consent then returns false", () => {
  const env = makeTempEnv();
  saveXaiMcpConsent(false, { env });
  assert.equal(readXaiMcpConsent({ env }), false);
});

test("given consent path when getting path then under CODEX_HOME ledger", () => {
  const env = makeTempEnv();
  const consentPath = getXaiMcpConsentPath({ env });
  assert.ok(consentPath.includes(".ledger"));
  assert.ok(consentPath.includes("lfp"));
  assert.ok(consentPath.includes("xai-mcp"));
});

test("given fresh CODEX_HOME when checking status then plugin not installed", () => {
  const env = makeTempEnv();
  const status = getXaiMcpPluginStatus({ env });
  assert.equal(status.pluginFilesInstalled, false);
  assert.equal(status.mcpServerBuilt, false);
});

test("given skipXaiMcp option when checking should prompt then returns false", () => {
  assert.equal(shouldPromptXaiMcpPlugin({ skipXaiMcp: true }), false);
  assert.equal(shouldPromptXaiMcpPlugin({ check: true }), false);
});

test("given promptXaiMcp true and skipXaiMcp false when shouldPromptXaiMcpPlugin then returns true in TTY per opt-in flag matrix", () => {
  const originalTty = process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  try {
    assert.equal(shouldPromptXaiMcpPlugin({ promptXaiMcp: true, skipXaiMcp: false }), true);
    assert.equal(shouldPromptXaiMcpPlugin({ promptXaiMcp: true, skipXaiMcp: true }), false);
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: originalTty, configurable: true });
  }
});
