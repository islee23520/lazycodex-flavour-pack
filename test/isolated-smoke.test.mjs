import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const SMOKE_SCRIPT = path.resolve("scripts", "isolated-smoke.mjs");
const LAZYCODEX_INSTALL_STUB = path.resolve("test/fixtures/lazycodex-install-stub.mjs");

test("given isolated smoke command when run then setup and doctor pass without real Codex home", () => {
  const sentinelRoot = mkdtempSync(path.join(tmpdir(), "lfp-sentinel-"));
  const sentinelCodexHome = path.join(sentinelRoot, "codex-home");
  try {
    const result = spawnSync(process.execPath, [SMOKE_SCRIPT], {
      cwd: path.resolve("."),
      env: {
        ...process.env,
        CODEX_HOME: sentinelCodexHome,
        LFP_LAZYCODEX_INSTALL_BIN: process.execPath,
        LFP_LAZYCODEX_INSTALL_ARGS: JSON.stringify([LAZYCODEX_INSTALL_STUB])
      },
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /isolated smoke: PASS/);
    assert.match(result.stdout, /setup installed lfp@islee23520=true/);
    assert.match(result.stdout, /duplicate tool cache healthy=true/);
    assert.match(result.stdout, /saved adjust prompt shown=true/);
    assert.match(result.stdout, /prompts continued after saved adjust=true/);
    assert.match(result.stdout, /updated agents=metis.toml/);
    assert.doesNotMatch(result.stdout, new RegExp(escapeRegExp(sentinelCodexHome)));
    assert.equal(existsSync(sentinelCodexHome), false);
  } finally {
    rmSync(sentinelRoot, { recursive: true, force: true });
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
