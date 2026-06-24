import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { getCodexAppsToolCacheState, quarantineDuplicateCodexAppsToolCaches } from "../src/codex/codex-apps-cache.ts";

test("given Codex Apps cache with duplicate tool names when inspected then reports duplicates", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-codex-apps-cache-"));
  try {
    const cacheDir = path.join(root, "cache", "codex_apps_tools");
    mkdirSync(cacheDir, { recursive: true });
    writeToolCache(path.join(cacheDir, "tools.json"), ["_fetch", "_search", "_fetch"]);

    const state = getCodexAppsToolCacheState({ env: { CODEX_HOME: root } });

    assert.equal(state.healthy, false);
    assert.equal(state.duplicateFiles.length, 1);
    assert.deepEqual(state.duplicateFiles[0].duplicateToolNames, ["_fetch"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given Codex Apps cache with duplicate tool names when quarantined then stale cache is moved", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-codex-apps-cache-"));
  try {
    const cacheDir = path.join(root, "cache", "codex_apps_tools");
    const cachePath = path.join(cacheDir, "tools.json");
    mkdirSync(cacheDir, { recursive: true });
    writeToolCache(cachePath, ["_fetch", "_fetch"]);

    const result = quarantineDuplicateCodexAppsToolCaches({
      env: { CODEX_HOME: root },
      now: new Date("2026-06-09T00:00:00.000Z")
    });

    assert.equal(result.quarantined.length, 1);
    assert.equal(existsSync(cachePath), false);
    assert.equal(readdirSync(path.join(cacheDir, "quarantine")).length, 1);
    assert.match(result.quarantined[0].targetPath, /2026-06-09T00-00-00-000Z-tools\.json$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeToolCache(filePath, toolNames) {
  writeFileSync(
    filePath,
    JSON.stringify({
      schema_version: 3,
      tools: toolNames.map((toolName) => ({ tool_name: toolName }))
    })
  );
}
