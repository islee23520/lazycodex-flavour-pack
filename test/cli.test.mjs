import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const CLI = path.resolve("scripts/cli.mjs");
const LAZYCODEX_INSTALL_STUB = path.resolve("test/fixtures/lazycodex-install-stub.mjs");

test("given npx-style CLI setup when upstream agent exists then updates configured fields", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "gpt-5.4-mini"\ndeveloper_instructions = """keep me"""\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "setup", "--config", configPath, "--skip-art-prompt"], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });
    const updated = readFileSync(agentPath, "utf8");
    const codexConfig = readFileSync(path.join(codexHome, "config.toml"), "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /lazycodex-ai install stub/);
    assert.match(result.stdout, /installed lfp@islee23520/);
    assert.equal(result.stdout.indexOf("lazycodex-ai install stub") < result.stdout.indexOf("installed lfp@islee23520"), true);
    assert.match(result.stdout, /updated .*explorer\.toml/);
    assert.match(updated, /model = "grok-4\.3"/);
    assert.match(updated, /developer_instructions = """keep me"""/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp", ".codex-plugin", "plugin.json")), true);
    assert.equal(existsSync(path.join(codexHome, "agents", "visual-engineering.toml")), true);
    assert.equal(existsSync(path.join(codexHome, "agents", "visual-looker.toml")), true);
    assert.match(codexConfig, /\[marketplaces\.islee23520\]/);
    assert.match(codexConfig, /\[plugins\."lfp@islee23520"\]/);
    assert.match(codexConfig, /enabled = true/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given local CLI setup skips LazyCodex install when requested then installs checkout files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "gpt-5.4-mini"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(
      process.execPath,
      [CLI, "setup", "--config", configPath, "--skip-art-prompt", "--skip-model-prompt", "--skip-lazycodex-install"],
      {
        env: cliEnv(codexHome),
        encoding: "utf8"
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /skipping LazyCodex install; using local LFP checkout files/);
    assert.doesNotMatch(result.stdout, /lazycodex-ai install stub/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp", "scripts", "cli.mjs")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given Korean postposition is attached to setup flag when CLI runs then accepts the intended flag", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "gpt-5.4-mini"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "setup", "--config", configPath, "--skip-art-prompt를"], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /installed lfp@islee23520/);
    assert.doesNotMatch(result.stderr, /Unknown sync option/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given npx-style CLI dry-setup when changes are pending then exits nonzero without writing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "gpt-5.4-mini"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "dry-setup", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });
    const unchanged = readFileSync(agentPath, "utf8");

    assert.equal(result.status, 1);
    assert.match(result.stdout, /would install plugin files/);
    assert.match(result.stdout, /would install LFP agents/);
    assert.match(result.stdout, /would update .*explorer\.toml/);
    assert.match(unchanged, /model = "gpt-5\.4-mini"/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given CLI help when invoked then documents npx usage", () => {
  const result = spawnSync(process.execPath, [CLI, "help"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npx @islee23520\/lfp@latest setup/);
  assert.match(result.stdout, /npx @islee23520\/lfp@latest dry-setup/);
  assert.match(result.stdout, /npx @islee23520\/lfp@latest doctor/);
  assert.match(result.stdout, /npx @islee23520\/lfp@latest agent-config/);
  assert.match(result.stdout, /runs npx lazycodex-ai install before applying LFP/);
});

test("given setup config is missing when setup runs then leaves Codex home unmodified", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const configPath = path.join(root, "missing.json");

    const result = spawnSync(process.execPath, [CLI, "setup", "--config", configPath, "--skip-art-prompt"], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Override config does not exist/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp")), false);
    assert.equal(existsSync(path.join(codexHome, "agents", "visual-engineering.toml")), false);
    assert.equal(existsSync(path.join(codexHome, "config.toml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given upstream agents dir is missing when setup runs then leaves Codex home unmodified", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "missing-agents");
    const configPath = path.join(root, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "setup", "--config", configPath, "--skip-art-prompt"], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /agents_dir does not exist/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp")), false);
    assert.equal(existsSync(path.join(codexHome, "agents", "visual-engineering.toml")), false);
    assert.equal(existsSync(path.join(codexHome, "config.toml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given required upstream agent is missing when setup runs then leaves Codex home unmodified", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    mkdirSync(sourceDir);
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "setup", "--config", configPath, "--skip-art-prompt"], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing required agent TOML files/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp")), false);
    assert.equal(existsSync(path.join(codexHome, "agents", "visual-engineering.toml")), false);
    assert.equal(existsSync(path.join(codexHome, "config.toml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given CLI doctor when changes are pending then reports setup work without writing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "gpt-5.4-mini"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const result = spawnSync(process.execPath, [CLI, "doctor", "--config", configPath], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });
    const unchanged = readFileSync(agentPath, "utf8");

    assert.equal(result.status, 1);
    assert.match(result.stdout, /plugin files: missing/);
    assert.match(result.stdout, /LFP agents: missing/);
    assert.match(result.stdout, /plugin config: missing/);
    assert.match(result.stdout, /agent overrides: setup would update/);
    assert.match(result.stdout, /would update .*explorer\.toml/);
    assert.match(unchanged, /model = "gpt-5\.4-mini"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given setup has run when doctor runs then reports lfp installed in Codex", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "config.json");
    const agentPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(agentPath, 'name = "explorer"\nmodel = "grok-4.3"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const setup = spawnSync(process.execPath, [CLI, "setup", "--config", configPath, "--skip-art-prompt"], {
      env: cliEnv(codexHome),
      encoding: "utf8"
    });
    const doctor = spawnSync(process.execPath, [CLI, "doctor", "--config", configPath], {
      env: { ...process.env, CODEX_HOME: codexHome },
      encoding: "utf8"
    });

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /plugin files: installed/);
    assert.match(doctor.stdout, /LFP agents: installed/);
    assert.match(doctor.stdout, /marketplace config: configured/);
    assert.match(doctor.stdout, /plugin config: enabled/);
    assert.match(doctor.stdout, /agent overrides: already applied/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function cliEnv(codexHome) {
  return {
    ...process.env,
    CODEX_HOME: codexHome,
    LFP_LAZYCODEX_INSTALL_BIN: process.execPath,
    LFP_LAZYCODEX_INSTALL_ARGS: JSON.stringify([LAZYCODEX_INSTALL_STUB])
  };
}
