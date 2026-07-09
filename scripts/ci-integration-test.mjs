#!/usr/bin/env node
// CI Integration Test — exercises real LFP CLI surfaces against isolated CODEX_HOME
// Runs with plain node (no tsx) against compiled dist/ output
// Updated for T5: reflects prune of legacy LFP-owned agents (no longer ships/installs oracle.toml etc.);
// aligns doctor output with current "no LFP-owned agent tomls" messaging. No expansion of prune logic.

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const LFP_ROOT = path.resolve(import.meta.dirname, "..");
const ALL_AGENTS = [
  "explorer", "librarian", "metis", "momus", "plan",
  "lazycodex-executor", "lazycodex-code-reviewer", "lazycodex-qa-executor",
  "lazycodex-gate-reviewer", "lazycodex-clone-fidelity-reviewer",
  "oracle", "prometheus", "hephaestus", "atlas", "sisyphus-junior"
];

let failures = 0;
let passed = 0;

function runCli(args, env) {
  const result = spawnSync("node", [path.join(LFP_ROOT, "scripts", "cli.mjs"), ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    cwd: LFP_ROOT,
    timeout: 30000
  });
  return { stdout: result.stdout || "", stderr: result.stderr || "", status: result.status };
}

function test(name, fn) {
  try {
    fn();
    console.log(`\u2713 ${name}`);
    passed++;
  } catch (error) {
    console.error(`\u2717 ${name}: ${error.message}`);
    failures++;
  }
}

function createTempCodexHome() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "lfp-ci-"));
  const codexHome = path.join(tmpDir, "codex");
  const agentsDir = path.join(codexHome, "agents");
  mkdirSync(agentsDir, { recursive: true });
  for (const agent of ALL_AGENTS) {
    writeFileSync(path.join(agentsDir, `${agent}.toml`), `name = "${agent}"\nmodel = "gpt-5.5"\n`);
  }
  return { tmpDir, codexHome, agentsDir };
}

const { tmpDir, codexHome } = createTempCodexHome();

try {
  test("help command shows all commands", () => {
    const { stdout, status } = runCli(["help"], { CODEX_HOME: codexHome });
    assert.equal(status, 0, "help should exit 0");
    assert.ok(stdout.includes("setup"), "help should show setup");
    assert.ok(stdout.includes("doctor"), "help should show doctor");
    assert.ok(stdout.includes("agent-config"), "help should show agent-config");
    assert.ok(stdout.includes("skill-manager"), "help should show skill-manager");
    assert.ok(stdout.includes("xai"), "help should show xai");
    assert.ok(stdout.includes("benchmark-models"), "help should show benchmark-models");
  });

  test("doctor reports install status", () => {
    const { stdout } = runCli(
      ["doctor", "--config", path.join(LFP_ROOT, "agent-configs", "omo-agent-model-overrides.toml")],
      { CODEX_HOME: codexHome }
    );
    assert.ok(stdout.includes("lfp doctor:"), "doctor should produce output");
    assert.ok(stdout.includes("categories:"), "doctor should report categories");
    assert.ok(stdout.includes("runtime fallback:"), "doctor should report runtime fallback");
  });

  test("setup prunes removed LFP-owned agents from CODEX_HOME", () => {
    const { stdout, status } = runCli(
      ["setup", "--skip-lazycodex-install", "--skip-model-prompt", "--config", path.join(LFP_ROOT, "agent-configs", "omo-agent-model-overrides.toml")],
      { CODEX_HOME: codexHome }
    );
    assert.equal(status, 0, `setup should exit 0, got ${status}: ${stdout}`);
    for (const agent of ["oracle", "prometheus", "hephaestus", "atlas", "sisyphus-junior"]) {
      const agentPath = path.join(codexHome, "agents", `${agent}.toml`);
      assert.ok(!existsSync(agentPath), `${agent}.toml should be pruned (not exist) after setup`);
    }
  });

  test("doctor after setup reports current agent surface (no LFP-owned TOMLs)", () => {
    const { stdout } = runCli(
      ["doctor", "--config", path.join(LFP_ROOT, "agent-configs", "omo-agent-model-overrides.toml")],
      { CODEX_HOME: codexHome }
    );
    assert.ok(stdout.includes("no LFP-owned agent tomls"), "doctor should report no LFP-owned agent tomls per current surface");
    assert.ok(stdout.includes("categories: configured"), "doctor should report categories configured");
    assert.ok(stdout.includes("runtime fallback: configured"), "doctor should report runtime fallback configured");
  });

  test("skill-manager check exits cleanly", () => {
    const { stdout, status } = runCli(["skill-manager", "--check", "--json"], { CODEX_HOME: codexHome });
    try {
      JSON.parse(stdout);
    } catch {
      assert.ok(status === 0 || status === null, `skill-manager exited ${status}`);
    }
  });

  test("xai auth status returns JSON", () => {
    const { stdout, status } = runCli(["xai", "auth", "status", "--json"], { CODEX_HOME: codexHome });
    try {
      JSON.parse(stdout);
    } catch {
      assert.ok(status === 0 || status === null, `xai auth status exited ${status}`);
    }
  });

  test("no MCP configuration in installed plugin", () => {
    const configPath = path.join(codexHome, "config.toml");
    if (existsSync(configPath)) {
      const configText = readFileSync(configPath, "utf8");
      assert.ok(!configText.includes("mcpServers"), "config.toml must not contain mcpServers");
      assert.ok(!configText.includes("mcp_servers"), "config.toml must not contain mcp_servers");
    }
  });
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) {
  process.exit(1);
}
