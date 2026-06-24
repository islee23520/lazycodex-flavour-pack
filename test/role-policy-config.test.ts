import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  clearRolePolicyConfigCache,
  getUserRolePolicyConfigPath,
  parseRolePolicyToml,
  ROLE_POLICY_REPORT_ORDER,
  readRolePolicyConfig
} from "../src/model/role-policy-config.ts";

const EXPECTED_DEFAULT_POLICIES = {
  explorer: { reasoning: "low", tier: "fast" },
  librarian: { reasoning: "low", tier: "fast" },
  metis: { reasoning: "high", tier: "default" },
  plan: { reasoning: "xhigh", tier: "default" },
  momus: { reasoning: "xhigh", tier: "default" },
  "lazycodex-executor": { reasoning: "high", tier: "default" },
  "lazycodex-code-reviewer": { reasoning: "xhigh", tier: "default" },
  "lazycodex-qa-executor": { reasoning: "medium", tier: "default" },
  "lazycodex-gate-reviewer": { reasoning: "xhigh", tier: "default" },
  "lazycodex-clone-fidelity-reviewer": { reasoning: "xhigh", tier: "default" }
};

function withTempCodexHome(testFn) {
  const codexHome = mkdtempSync(path.join(os.tmpdir(), "lfp-role-policy-test-"));
  try {
    return testFn(codexHome);
  } finally {
    clearRolePolicyConfigCache();
    rmSync(codexHome, { recursive: true, force: true });
  }
}

function writeUserPolicyToml(codexHome, toml) {
  const userPath = getUserRolePolicyConfigPath({ env: { CODEX_HOME: codexHome } });
  mkdirSync(path.dirname(userPath), { recursive: true });
  writeFileSync(userPath, `${toml.trim()}\n`);
  return userPath;
}

describe("role-policy-config", () => {
  it("given no user file when reading role policy config then returns packaged defaults for all report roles", () => {
    withTempCodexHome((codexHome) => {
      clearRolePolicyConfigCache();

      const config = readRolePolicyConfig({ env: { CODEX_HOME: codexHome } });

      assert.deepEqual(ROLE_POLICY_REPORT_ORDER, Object.keys(EXPECTED_DEFAULT_POLICIES));
      assert.deepEqual(config.policies, EXPECTED_DEFAULT_POLICIES);
      assert.equal(config.source.userPath, null);
      assert.match(config.source.defaultPath, /agent-configs[/\\]lfp-role-policies\.toml$/);
    });
  });

  it("given user overrides when reading role policy config then merges user values over packaged defaults", () => {
    withTempCodexHome((codexHome) => {
      const userPath = writeUserPolicyToml(
        codexHome,
        `
        [policies.explorer]
        reasoning = "medium"
        tier = "default"

        [policies.plan]
        tier = "fast"
        `
      );

      const config = readRolePolicyConfig({ env: { CODEX_HOME: codexHome } });

      assert.deepEqual(config.policies.explorer, { reasoning: "medium", tier: "default" });
      assert.deepEqual(config.policies.plan, { reasoning: "xhigh", tier: "fast" });
      assert.deepEqual(config.policies.librarian, EXPECTED_DEFAULT_POLICIES.librarian);
      assert.equal(config.source.userPath, userPath);
    });
  });

  it("given invalid user policy values when reading role policy config then preserves packaged defaults", () => {
    withTempCodexHome((codexHome) => {
      writeUserPolicyToml(
        codexHome,
        `
        [policies.explorer]
        reasoning = "maximum"
        tier = "turbo"
        `
      );

      const config = readRolePolicyConfig({ env: { CODEX_HOME: codexHome } });

      assert.deepEqual(config.policies.explorer, EXPECTED_DEFAULT_POLICIES.explorer);
    });
  });

  it("given mixed TOML when parsing role policies then ignores comments unsupported sections bare values unknown keys and invalid values", () => {
    const policies = parseRolePolicyToml(`
      # ignored comment
      [source]
      reasoning = "high"

      [agents.explorer]
      reasoning = "high"

      [policies.explorer]
      reasoning = "medium"
      tier = "default"
      unknown = "ignored"

      [policies.librarian]
      reasoning = low
      tier = fast

      [policies.metis]
      reasoning = "maximum"
      tier = "turbo"

      [policies.plan]
      reasoning = "high"
      tier = "fast"
    `);

    assert.deepEqual(policies, {
      explorer: { reasoning: "medium", tier: "default" },
      plan: { reasoning: "high", tier: "fast" }
    });
  });

  it("given CODEX_HOME env when resolving user role policy path then returns lfp policy path under CODEX_HOME", () => {
    withTempCodexHome((codexHome) => {
      const userPath = getUserRolePolicyConfigPath({ env: { CODEX_HOME: ` ${codexHome} ` } });

      assert.equal(userPath, path.join(codexHome, "lfp", "lfp-role-policies.toml"));
    });
  });

  it("given cached policy config when clearing cache and changing user file then second read sees updated values", () => {
    withTempCodexHome((codexHome) => {
      const userPath = writeUserPolicyToml(
        codexHome,
        `
        [policies.explorer]
        reasoning = "medium"
        `
      );

      const first = readRolePolicyConfig({ env: { CODEX_HOME: codexHome } });
      clearRolePolicyConfigCache();
      writeFileSync(
        userPath,
        `
        [policies.explorer]
        reasoning = "high"
        tier = "default"
        `
      );
      const second = readRolePolicyConfig({ env: { CODEX_HOME: codexHome } });

      assert.equal(first.policies.explorer.reasoning, "medium");
      assert.deepEqual(second.policies.explorer, { reasoning: "high", tier: "default" });
    });
  });
});
