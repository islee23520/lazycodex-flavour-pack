import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const CLI = path.resolve("scripts/cli.mjs");

test("given setup has run when doctor runs then reports visual Gemini smoke verification", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-visual-smoke-"));
  try {
    const fixture = createFixture(root);

    const setup = runCli(["setup", "--config", fixture.configPath], fixture.codexHome);
    const doctor = runCli(["doctor", "--config", fixture.configPath], fixture.codexHome);

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /visual smoke: verified/);
    assert.match(doctor.stdout, /visual-engineering: gemini-3\.1-pro-preview/);
    assert.match(doctor.stdout, /visual-looker: gemini-3\.1-pro-preview/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given visual looker is missing when doctor runs then reports visual smoke failure", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-visual-smoke-"));
  try {
    const fixture = createFixture(root);
    const missingPath = path.join(fixture.codexHome, "agents", "visual-looker.toml");

    const setup = runCli(["setup", "--config", fixture.configPath], fixture.codexHome);
    unlinkSync(missingPath);
    const doctor = runCli(["doctor", "--config", fixture.configPath], fixture.codexHome);

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(doctor.status, 1);
    assert.match(doctor.stdout, /visual smoke: failed/);
    assert.match(doctor.stdout, new RegExp(`visual-looker missing \\(${escapeRegExp(missingPath)}\\)`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given visual agent model is not Gemini when doctor runs then reports model mismatch", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-visual-smoke-"));
  try {
    const fixture = createFixture(root);
    const driftedPath = path.join(fixture.codexHome, "agents", "visual-looker.toml");

    const setup = runCli(["setup", "--config", fixture.configPath], fixture.codexHome);
    const drifted = readFileSync(driftedPath, "utf8").replace(
      'model = "gemini-3.1-pro-preview"',
      'model = "gpt-5.4"'
    );
    writeFileSync(driftedPath, drifted);
    const doctor = runCli(["doctor", "--config", fixture.configPath], fixture.codexHome);

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(doctor.status, 1);
    assert.match(doctor.stdout, /visual smoke: failed/);
    assert.match(
      doctor.stdout,
      /visual-looker model mismatch: expected gemini-3\.1-pro-preview, got gpt-5\.4/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given dry setup when visual smoke is pending then remains a lightweight LFP preview", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-visual-smoke-"));
  try {
    const fixture = createFixture(root);

    const drySetup = runCli(["dry-setup", "--config", fixture.configPath], fixture.codexHome);

    assert.equal(drySetup.status, 1);
    assert.match(drySetup.stdout, /would install plugin files/);
    assert.match(drySetup.stdout, /would install LFP agents/);
    assert.doesNotMatch(drySetup.stdout, /install LazyCodex|update LazyCodex|install OMO|update OMO/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createFixture(root) {
  const codexHome = path.join(root, "codex-home");
  const sourceDir = path.join(root, "agents");
  const configPath = path.join(root, "config.json");
  mkdirSync(sourceDir);
  writeFileSync(path.join(sourceDir, "explorer.toml"), 'name = "explorer"\nmodel = "grok-4.3"\n');
  writeFileSync(
    configPath,
    JSON.stringify({
      source: { agentsDir: sourceDir },
      overrides: { explorer: { model: "grok-4.3" } }
    })
  );
  return { codexHome, configPath };
}

function runCli(args, codexHome) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, CODEX_HOME: codexHome },
    encoding: "utf8"
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
