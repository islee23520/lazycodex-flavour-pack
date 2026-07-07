import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applySkillManagerPlan,
  collectSkillManagerState,
  createSkillManagerPlan
} from "../src/skills/skill-manager.ts";

const CLI = path.resolve("scripts/cli.mjs");

test("given skill roots when collecting state then classifies active library disabled invalid duplicate and symlink skills", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-skill-manager-"));
  try {
    const codexHome = path.join(root, "codex");
    const home = path.join(root, "home");
    writeSkill(path.join(codexHome, "skills", "valid-skill"), "valid-skill");
    mkdirSync(path.join(codexHome, "skills", "broken-skill"), { recursive: true });
    writeSkill(path.join(codexHome, "skills.library", "codex", "library-skill"), "library-skill");
    writeSkill(path.join(codexHome, "skills.disabled", "disabled-skill"), "disabled-skill");
    writeSkill(path.join(home, ".agents", "skills", "valid-skill"), "agent-valid-skill");
    symlinkSync(path.join(codexHome, "skills", "valid-skill"), path.join(codexHome, "skills", "linked-skill"));

    const state = collectSkillManagerState({ env: { CODEX_HOME: codexHome, HOME: home } });

    assert.equal(
      state.inventory.some((entry) => entry.name === "valid-skill" && entry.location === "active"),
      true
    );
    assert.equal(
      state.inventory.some((entry) => entry.name === "library-skill" && entry.location === "library"),
      true
    );
    assert.equal(
      state.inventory.some((entry) => entry.name === "disabled-skill" && entry.location === "disabled"),
      true
    );
    assert.equal(
      state.issues.some((issue) => issue.kind === "invalid-skill" && issue.name === "broken-skill"),
      true
    );
    assert.equal(
      state.issues.some((issue) => issue.kind === "duplicate-skill" && issue.name === "valid-skill"),
      true
    );
    assert.equal(
      state.skipped.some((item) => item.reason === "symlink" && item.path.endsWith("linked-skill")),
      true
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given invalid active skill when applying plan then moves it to matching disabled root and writes receipt", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-skill-manager-"));
  try {
    const codexHome = path.join(root, "codex");
    const home = path.join(root, "home");
    const invalidPath = path.join(codexHome, "skills", "broken-skill");
    mkdirSync(invalidPath, { recursive: true });
    writeSkill(path.join(codexHome, "skills.library", "codex", "library-broken"), "library-broken");

    const state = collectSkillManagerState({ env: { CODEX_HOME: codexHome, HOME: home } });
    const plan = createSkillManagerPlan(state);
    const result = applySkillManagerPlan(plan, { env: { CODEX_HOME: codexHome, HOME: home } });
    const movedPath = path.join(codexHome, "skills.disabled", "broken-skill");

    assert.equal(existsSync(invalidPath), false);
    assert.equal(existsSync(movedPath), true);
    assert.equal(result.appliedMoves.length, 1);
    assert.equal(result.appliedMoves[0]?.from, invalidPath);
    assert.equal(result.appliedMoves[0]?.to, movedPath);
    assert.equal(typeof result.receiptPath, "string");
    assert.equal(result.receiptPath?.startsWith(path.join(codexHome, ".omo", "skill-manager")), true);
    assert.equal(existsSync(result.receiptPath ?? ""), true);
    assert.equal(existsSync(path.join(codexHome, "skills.library", "codex", "library-broken")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given symlink skill when applying plan then never follows or moves it", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-skill-manager-"));
  try {
    const codexHome = path.join(root, "codex");
    const home = path.join(root, "home");
    const target = path.join(root, "target-skill");
    const link = path.join(codexHome, "skills", "linked-skill");
    writeSkill(target, "target-skill");
    mkdirSync(path.dirname(link), { recursive: true });
    symlinkSync(target, link);

    const state = collectSkillManagerState({ env: { CODEX_HOME: codexHome, HOME: home } });
    const result = applySkillManagerPlan(createSkillManagerPlan(state), { env: { CODEX_HOME: codexHome, HOME: home } });

    assert.equal(result.appliedMoves.length, 0);
    assert.equal(lstatSync(link).isSymbolicLink(), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given CLI check json when invalid skill exists then reports planned move without moving files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-skill-manager-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const home = path.join(root, "home");
    const invalidPath = path.join(codexHome, "skills", "broken-skill");
    mkdirSync(invalidPath, { recursive: true });

    const result = spawnSync(process.execPath, [CLI, "skill-manager", "--check", "--json"], {
      env: { ...process.env, CODEX_HOME: codexHome, HOME: home },
      encoding: "utf8"
    });
    const parsed = JSON.parse(result.stdout);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(parsed.plannedMoves.length, 1);
    assert.equal(parsed.plannedMoves[0].from, invalidPath);
    assert.equal(existsSync(invalidPath), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given CLI apply json when invalid skill exists then moves skill and writes receipt", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lfp-skill-manager-cli-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const home = path.join(root, "home");
    const invalidPath = path.join(codexHome, "skills", "broken-skill");
    const disabledPath = path.join(codexHome, "skills.disabled", "broken-skill");
    mkdirSync(invalidPath, { recursive: true });

    const result = spawnSync(process.execPath, [CLI, "skill-manager", "--apply", "--json"], {
      env: { ...process.env, CODEX_HOME: codexHome, HOME: home },
      encoding: "utf8"
    });
    const parsed = JSON.parse(result.stdout);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(parsed.appliedMoves.length, 1);
    assert.equal(parsed.appliedMoves[0].from, invalidPath);
    assert.equal(parsed.appliedMoves[0].to, disabledPath);
    assert.equal(existsSync(invalidPath), false);
    assert.equal(existsSync(disabledPath), true);
    assert.equal(parsed.receiptPath.startsWith(path.join(codexHome, ".omo", "skill-manager")), true);
    assert.equal(existsSync(parsed.receiptPath), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given CLI receives check and apply then rejects conflicting flags", () => {
  const result = spawnSync(process.execPath, [CLI, "skill-manager", "--check", "--apply"], { encoding: "utf8" });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot be combined/);
});

test("given CLI help when invoked then documents skill manager usage", () => {
  const result = spawnSync(process.execPath, [CLI, "help"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npx @islee23520\/lfp@latest skill-manager/);
  assert.match(result.stdout, /skill-manager\s+Audit local skill folders/);
});

function writeSkill(skillPath, name) {
  mkdirSync(skillPath, { recursive: true });
  writeFileSync(
    path.join(skillPath, "SKILL.md"),
    [`---`, `name: ${name}`, `description: test skill`, `---`, ``, `# ${name}`, ``].join("\n")
  );
}
