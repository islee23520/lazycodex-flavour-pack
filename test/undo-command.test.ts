import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { formatCheckPreview, printLines } from "../src/cli/destructive-action-preview.ts";

const CLI = path.resolve("scripts/cli.mjs");
const LAZYCODEX_INSTALL_STUB = path.resolve("test/fixtures/lazycodex-install-stub.mjs");

test("given empty actions when formatCheckPreview delete then exact nothing to remove", () => {
  assert.deepEqual(formatCheckPreview("delete", []), ["lfp delete: nothing to remove"]);
});

test("given empty actions when formatCheckPreview undo then exact nothing to undo", () => {
  assert.deepEqual(formatCheckPreview("undo", []), ["lfp undo: nothing to undo"]);
});

test("given actions when formatCheckPreview undo then uses restore header and would lines", () => {
  const lines = formatCheckPreview("undo", [
    "run npx lazycodex-ai@latest install to restore upstream",
    "remove saved LFP model config /home/u/.codex/lfp.json"
  ]);
  assert.deepEqual(lines, [
    "lfp undo: would restore LazyCodex original surface:",
    "would run npx lazycodex-ai@latest install to restore upstream",
    "would remove saved LFP model config /home/u/.codex/lfp.json"
  ]);
});

test("given lines when printLines calls output.log per line", () => {
  const captured: string[] = [];
  const out = {
    log(l: string) {
      captured.push(l);
    }
  };
  printLines(["would foo", "would bar"], out);
  assert.deepEqual(captured, ["would foo", "would bar"]);
});

// Integration: undo --check with lfp.json present (covers getPendingUndoActions + shared preview)
test("given lfp.json present when undo --check then prints restore preview with saved config action and sets exit 1", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-undo-check-"));
  try {
    const codexHome = path.join(root, "codex-home");
    mkdirSync(codexHome, { recursive: true });
    const lfpJsonPath = path.join(codexHome, "lfp.json");
    writeFileSync(lfpJsonPath, '{"schemaVersion":2,"source":{},"overrides":{}}\n');

    const check = runCli(["undo", "--check"], codexHome);

    assert.equal(check.status, 1, `stderr: ${check.stderr}`);
    assert.match(check.stdout, /lfp undo: would restore LazyCodex original surface:/);
    assert.match(check.stdout, /remove saved LFP model config/);
    // ensure would- prefixing from shared fn
    assert.match(check.stdout, /would remove saved LFP model config/);
    // at minimum also contains the restore lazycodex action
    assert.match(check.stdout, /would run .*lazycodex.*install/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given no lfp.json and no plugin when undo --check still reports at least the lazycodex restore action", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-undo-check-emptyish-"));
  try {
    const codexHome = path.join(root, "codex-home");
    mkdirSync(codexHome, { recursive: true });

    const check = runCli(["undo", "--check"], codexHome);

    assert.equal(check.status, 1);
    assert.match(check.stdout, /would restore LazyCodex original surface:/);
    assert.match(check.stdout, /would run .* to restore upstream LazyCodex/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function runCli(args, codexHome) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      HOME: path.dirname(codexHome),
      LFP_LAZYCODEX_INSTALL_BIN: process.execPath,
      LFP_LAZYCODEX_INSTALL_ARGS: JSON.stringify([LAZYCODEX_INSTALL_STUB])
    },
    encoding: "utf8"
  });
}
