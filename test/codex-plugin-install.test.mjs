import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { installCodexPlugin } from "../scripts/codex-plugin-install.mjs";

test("given installed LFP plugin when a later copy fails then previous plugin files are preserved", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-atomic-install-"));
  const originalEnv = process.env.CODEX_HOME;
  try {
    const codexHome = path.join(root, "codex-home");
    process.env.CODEX_HOME = codexHome;
    const brokenPackageRoot = path.join(root, "broken-package");

    installCodexPlugin(path.resolve("."), { env: { ...process.env, CODEX_HOME: codexHome } });
    const installedReadmePath = path.join(
      codexHome,
      "local-marketplaces",
      "islee23520",
      "plugins",
      "lfp",
      "README.md"
    );
    const previousReadme = readFileSync(installedReadmePath, "utf8");

    createBrokenPackageRoot(brokenPackageRoot);

    assert.throws(
      () => installCodexPlugin(brokenPackageRoot, { env: { ...process.env, CODEX_HOME: codexHome } }),
      /README\.md/
    );
    assert.equal(existsSync(installedReadmePath), true);
    assert.equal(readFileSync(installedReadmePath, "utf8"), previousReadme);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalEnv;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("given installed LFP plugin when helper agent install fails then previous plugin files are preserved", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-atomic-install-"));
  const originalEnv = process.env.CODEX_HOME;
  try {
    const codexHome = path.join(root, "codex-home");
    process.env.CODEX_HOME = codexHome;
    const brokenPackageRoot = path.join(root, "broken-package");

    installCodexPlugin(path.resolve("."), { env: { ...process.env, CODEX_HOME: codexHome } });
    const installedReadmePath = path.join(
      codexHome,
      "local-marketplaces",
      "islee23520",
      "plugins",
      "lfp",
      "README.md"
    );
    const previousReadme = readFileSync(installedReadmePath, "utf8");

    createBrokenPackageRoot(brokenPackageRoot);
    writeFileSync(path.join(brokenPackageRoot, "README.md"), "BROKEN PROMOTED README\n");
    rmSync(path.join(brokenPackageRoot, "agent-configs", "visual-engineering.toml"));

    assert.throws(
      () => installCodexPlugin(brokenPackageRoot, { env: { ...process.env, CODEX_HOME: codexHome } }),
      /visual-engineering\.toml/
    );
    assert.equal(readFileSync(installedReadmePath, "utf8"), previousReadme);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalEnv;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("given installed LFP plugin when config update fails then helper agents and plugin files are preserved", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-atomic-install-"));
  const originalEnv = process.env.CODEX_HOME;
  try {
    const codexHome = path.join(root, "codex-home");
    process.env.CODEX_HOME = codexHome;
    const brokenPackageRoot = path.join(root, "broken-package");

    installCodexPlugin(path.resolve("."), { env: { ...process.env, CODEX_HOME: codexHome } });
    const installedReadmePath = path.join(
      codexHome,
      "local-marketplaces",
      "islee23520",
      "plugins",
      "lfp",
      "README.md"
    );
    const visualAgentPath = path.join(codexHome, "agents", "visual-engineering.toml");
    const configPath = path.join(codexHome, "config.toml");
    const previousReadme = readFileSync(installedReadmePath, "utf8");
    const previousAgent = 'name = "visual-engineering"\nmodel = "custom-preserved"\n';
    writeFileSync(visualAgentPath, previousAgent);
    chmodSync(configPath, 0o444);

    createBrokenPackageRoot(brokenPackageRoot);
    writeFileSync(path.join(brokenPackageRoot, "README.md"), "BROKEN PROMOTED README\n");

    assert.throws(
      () => installCodexPlugin(brokenPackageRoot, { env: { ...process.env, CODEX_HOME: codexHome } }),
      /EACCES|permission denied/i
    );
    chmodSync(configPath, 0o644);
    assert.equal(readFileSync(installedReadmePath, "utf8"), previousReadme);
    assert.equal(readFileSync(visualAgentPath, "utf8"), previousAgent);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalEnv;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

function createBrokenPackageRoot(packageRoot) {
  const sourceRoot = path.resolve(".");
  for (const entry of [".codex-plugin", "agent-configs", "agent-overrides", "hooks", "scripts"]) {
    mkdirSync(path.dirname(path.join(packageRoot, entry)), { recursive: true });
    cpEntry(path.join(sourceRoot, entry), path.join(packageRoot, entry));
  }
  writeFileSync(path.join(packageRoot, "package.json"), "{}\n");
}

function cpEntry(source, target) {
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}
