import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const CLI = path.resolve("scripts/cli.mjs");

test("given upstream LazyCodex install fails when setup runs then LFP leaves Codex home untouched", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-preflight-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const failingInstall = path.join(root, "failing-install.mjs");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(path.join(agentsDir, "explorer.toml"), 'name = "explorer"\nmodel = "gpt-5.4-mini"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );
    writeFileSync(failingInstall, 'console.error("upstream failed"); process.exit(42);\n');

    const result = spawnSync(process.execPath, [CLI, "setup", "--config", configPath], {
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
        LFP_LAZYCODEX_INSTALL_BIN: process.execPath,
        LFP_LAZYCODEX_INSTALL_ARGS: JSON.stringify([failingInstall])
      },
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /upstream failed/);
    assert.match(result.stderr, /lazycodex-ai install failed with exit code 42/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp")), false);
    assert.equal(existsSync(path.join(codexHome, "config.toml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
