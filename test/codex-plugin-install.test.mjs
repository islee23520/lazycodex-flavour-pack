import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { installCodexPlugin } from "../scripts/codex-plugin-install.mjs";

test("given installed LFP plugin when runtime is promoted then hook registration files are installed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-runtime-hooks-"));
  const originalEnv = process.env.CODEX_HOME;
  try {
    const codexHome = path.join(root, "codex-home");
    process.env.CODEX_HOME = codexHome;

    const state = installCodexPlugin(path.resolve("."), { env: { ...process.env, CODEX_HOME: codexHome } });
    const hooksPath = path.join(state.pluginRoot, "hooks", "hooks.json");
    const manifestPath = path.join(state.pluginRoot, ".codex-plugin", "plugin.json");
    const marketplacePath = state.marketplaceManifestPath;
    const configText = readFileSync(state.configPath, "utf8");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const marketplace = JSON.parse(readFileSync(marketplacePath, "utf8"));
    const hooks = JSON.parse(readFileSync(hooksPath, "utf8"));

    assert.equal(existsSync(hooksPath), true);
    assert.equal(marketplace.name, "islee23520");
    assert.deepEqual(marketplace.plugins[0].source, { source: "local", path: "./plugins/lfp" });
    assert.equal(manifest.hooks, "./hooks/hooks.json");
    assert.equal(Object.hasOwn(manifest, "mcpServers"), false);
    assert.doesNotMatch(configText, /\[mcp_servers\.lfp_tools]/);
    assert.doesNotMatch(configText, /\[plugins\."lfp@islee23520"\.mcp_servers\.lfp_tools]/);
    assert.match(hooks.hooks.SessionStart[0].hooks[0].command, /sync-agent-overrides-hook\.mjs/);
    assert.match(hooks.hooks.UserPromptSubmit[0].hooks[0].command, /user-prompt-submit\.mjs/);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalEnv;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("given stale removed LFP agent files when installing then setup deletes them", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-stale-agent-cleanup-"));
  const originalEnv = process.env.CODEX_HOME;
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    process.env.CODEX_HOME = codexHome;
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(path.join(agentsDir, "visual-engineering.toml"), 'name = "visual-engineering"\n');
    writeFileSync(path.join(agentsDir, "visual-looker.toml"), 'name = "visual-looker"\n');
    writeFileSync(path.join(agentsDir, "sisyphus.toml"), 'name = "sisyphus"\n');
    writeFileSync(path.join(agentsDir, "explorer.toml"), 'name = "explorer"\n');

    installCodexPlugin(path.resolve("."), { env: { ...process.env, CODEX_HOME: codexHome } });

    assert.equal(existsSync(path.join(agentsDir, "visual-engineering.toml")), false);
    assert.equal(existsSync(path.join(agentsDir, "visual-looker.toml")), false);
    assert.equal(existsSync(path.join(agentsDir, "sisyphus.toml")), false);
    assert.equal(existsSync(path.join(agentsDir, "explorer.toml")), true);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalEnv;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

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

test("given installed LFP plugin when config update fails then previous plugin files are preserved", () => {
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
    const configPath = path.join(codexHome, "config.toml");
    const previousReadme = readFileSync(installedReadmePath, "utf8");
    chmodSync(configPath, 0o444);

    createBrokenPackageRoot(brokenPackageRoot);
    writeFileSync(path.join(brokenPackageRoot, "README.md"), "BROKEN PROMOTED README\n");

    assert.throws(
      () => installCodexPlugin(brokenPackageRoot, { env: { ...process.env, CODEX_HOME: codexHome } }),
      /EACCES|permission denied/i
    );
    chmodSync(configPath, 0o644);
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

function createBrokenPackageRoot(packageRoot) {
  const sourceRoot = path.resolve(".");
  for (const entry of [".codex-plugin", "agent-configs", "hooks", "scripts"]) {
    mkdirSync(path.dirname(path.join(packageRoot, entry)), { recursive: true });
    cpEntry(path.join(sourceRoot, entry), path.join(packageRoot, entry));
  }
  writeFileSync(path.join(packageRoot, "package.json"), "{}\n");
}

function cpEntry(source, target) {
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}
