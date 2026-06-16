import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

import { maybePromptModelOverrides, selectGitHubStartTarget } from "../scripts/setup-command.mjs";

const CLI = path.resolve("scripts/cli.mjs");

test("given GitHub start answer when selecting target then maps to supported repos", () => {
  assert.equal(selectGitHubStartTarget("1")?.repo, "sisyphuslabs/lazycodex-ai");
  assert.equal(selectGitHubStartTarget("omo")?.repo, "sisyphuslabs/omo");
  assert.equal(selectGitHubStartTarget("lfp")?.repo, "islee23520/lazycodex-flavour-pack");
  assert.equal(selectGitHubStartTarget(""), null);
});

test("given default setup model prompt when user declines editing then keeps configured overrides for sync", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-preflight-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(configPath, '[source]\nagents_dir = "${CODEX_HOME}/agents"\n\n[agents.explorer]\nmodel = "gpt-5.4-mini"\n');
    const output = captureOutput();

    await maybePromptModelOverrides({}, configPath, {
      env: { ...process.env, CODEX_HOME: root },
      readline: fakeReadline([""]),
      output
    });

    assert.ok(output.questions.some((question) => /Edit agent model overrides now/.test(question)));
    assert.ok(!output.questions.some((question) => /explorer model/.test(question)));
    assert.match(output.lines.join("\n"), /Keeping configured OMO model override values/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given setup can see provider models when user declines editing then it still prints recommendations", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-preflight-recommend-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
        "",
        "[agents.explorer]",
        'model = "old-explorer"',
        'model_reasoning_effort = "medium"',
        'service_tier = "default"',
        "",
        "[agents.metis]",
        'model = "old-metis"',
        'model_reasoning_effort = "low"',
        'service_tier = "fast"',
        ""
      ].join("\n")
    );
    const output = captureOutput();

    await maybePromptModelOverrides({}, configPath, {
      env: { ...process.env, CODEX_HOME: root },
      readline: fakeReadline([""]),
      output,
      models: ["gpt-5.4-mini", "gpt-5.5", "grok-4.20-0309-reasoning"]
    });

    const text = output.lines.join("\n");
    assert.match(text, /LFP model recommendations from the active provider:/);
    assert.match(text, /explorer: gpt-5\.4-mini .* from current old-explorer/);
    assert.match(text, /metis: grok-4\.20-0309-reasoning .* from current old-metis/);
    assert.match(text, /Keeping configured OMO model override values/);
    assert.ok(!output.questions.some((question) => /explorer model/.test(question)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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

function fakeReadline(answers) {
  return {
    question(question, resolve) {
      currentQuestions.push(question);
      resolve(answers.shift() ?? "");
    }
  };
}

let currentQuestions = [];

function captureOutput() {
  currentQuestions = [];
  return {
    questions: currentQuestions,
    lines: [],
    log(line = "") {
      this.lines.push(line);
    }
  };
}
