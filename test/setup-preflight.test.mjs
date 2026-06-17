import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

import { maybePromptModelOverrides, runSetupLineMode, selectGitHubStartTarget } from "../scripts/setup-command.mjs";

const CLI = path.resolve("scripts/cli.mjs");

test("given GitHub start answer when selecting target then maps to supported repos", () => {
  assert.equal(selectGitHubStartTarget("1")?.repo, "sisyphuslabs/lazycodex-ai");
  assert.equal(selectGitHubStartTarget("omo")?.repo, "sisyphuslabs/omo");
  assert.equal(selectGitHubStartTarget("lfp")?.repo, "islee23520/lazycodex-flavour-pack");
  assert.equal(selectGitHubStartTarget(""), null);
});

test("given default setup model prompt when user presses enter then shows guide and keeps configured overrides", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-preflight-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(
      path.join(root, "explorer.toml"),
      ['name = "explorer"', 'model = "gpt-5.4-mini"', 'model_reasoning_effort = "low"', 'service_tier = "fast"', ""].join("\n")
    );
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
        "",
        "[agents.explorer]",
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "low"',
        'service_tier = "fast"',
        ""
      ].join("\n")
    );
    const output = captureOutput();

    await maybePromptModelOverrides({}, configPath, {
      env: { ...process.env, CODEX_HOME: root, HOME: root },
      readline: fakeReadline(["", "", ""]),
      output
    });

    assert.ok(!output.questions.some((question) => /Edit agent model overrides now/.test(question)));
    assert.ok(output.questions.some((question) => /explorer model \[gpt-5\.4-mini]/.test(question)));
    assert.match(output.lines.join("\n"), /Showing default OMO\/LazyCodex model guide/);
    assert.match(output.lines.join("\n"), /Original\/current: gpt-5\.4-mini \(reasoning: low, tier: fast\)/);
    assert.match(output.lines.join("\n"), /Vanilla LazyCodex service tier: fast/);
    assert.match(output.lines.join("\n"), /Vanilla LazyCodex reasoning effort: low/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given setup can see provider models when user presses enter then shows recommendations before default prompts", async () => {
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
      env: { ...process.env, CODEX_HOME: root, HOME: root },
      readline: fakeReadline(["", "", "", "", "", ""]),
      output,
      models: ["gpt-5.4-mini", "gpt-5.5", "grok-4.20-0309-reasoning"]
    });

    const text = output.lines.join("\n");
    assert.match(text, /LFP model recommendations from the active provider:/);
    assert.match(text, /explorer: gpt-5\.4-mini .* from current old-explorer/);
    assert.match(text, /metis: grok-4\.20-0309-reasoning .* from current old-metis/);
    assert.match(text, /Showing default OMO\/LazyCodex model guide/);
    assert.ok(output.questions.some((question) => /explorer model/.test(question)));
    assert.ok(output.questions.some((question) => /metis model/.test(question)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given setup line mode gets isolated override options then default model guide does not read real saved config", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-preflight-integrated-"));
  const previousStdinTty = process.stdin.isTTY;
  const previousStdoutTty = process.stdout.isTTY;
  const previousCodexHome = process.env.CODEX_HOME;
  const previousHome = process.env.HOME;
  try {
    const codexHome = path.join(root, "codex-home");
    const isolatedUserConfig = path.join(root, "isolated-lfp.json");
    mkdirSync(path.join(codexHome, "agents"), { recursive: true });
    const output = captureOutput();

    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    process.env.CODEX_HOME = codexHome;
    process.env.HOME = root;

    await runSetupLineMode(
      { skipLazycodexInstall: true },
      { check: false, root: path.resolve("."), defaultConfig: path.resolve("agent-configs/omo-agent-model-overrides.toml") },
      {
        env: { ...process.env, CODEX_HOME: codexHome, HOME: root },
        userOverrideConfigPath: isolatedUserConfig,
        persistUserOverrides: false,
        output,
        models: ["gpt-5.4-mini", "gpt-5.5"],
        modelSelector: async ({ agentName, current }) => {
          output.questions.push(`${agentName} model ${current}`);
          return current;
        },
        tierSelector: async ({ current }) => current,
        reasoningSelector: async ({ current }) => current,
        yesNoSelector: async () => false,
        providerConsentSelector: async () => false,
        gitHubStartSelector: async () => null
      }
    );

    assert.ok(output.questions.some((question) => /default model gpt-5\.5/.test(question)));
    assert.ok(output.questions.some((question) => /ulw model gpt-5\.5/.test(question)));
    assert.ok(output.questions.some((question) => /explorer model gpt-5\.4-mini/.test(question)));
    assert.doesNotMatch(output.lines.join("\n"), /Adjust LFP model overrides now/);
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: previousStdinTty });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: previousStdoutTty });
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

test("given provider fetch fails in non-interactive setup then writes lfp json from packaged seed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-preflight-fallback-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const agentsDir = path.join(codexHome, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(path.join(agentsDir, "explorer.toml"), 'name = "explorer"\nmodel = "upstream-original"\n');
    writeFileSync(
      path.join(codexHome, "config.toml"),
      [
        'model_provider = "cliproxyapi"',
        "",
        "[model_providers.cliproxyapi]",
        'base_url = "http://127.0.0.1:9/v1"',
        'experimental_bearer_token = "sk-test-secret-DO-NOT-PRINT"',
        ""
      ].join("\n")
    );

    const result = spawnSync(process.execPath, [CLI, "setup", "--skip-lazycodex-install", "--skip-model-prompt"], {
      env: { ...process.env, CODEX_HOME: codexHome, HOME: root },
      encoding: "utf8"
    });
    const saved = JSON.parse(readFileSync(path.join(codexHome, "lfp.json"), "utf8"));
    const explorerText = readFileSync(path.join(agentsDir, "explorer.toml"), "utf8");
    const sisyphusText = readFileSync(path.join(agentsDir, "sisyphus.toml"), "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /wrote recommended models to .*lfp\.json/);
    assert.equal(saved.schemaVersion, 2);
    assert.equal(saved.overrides.explorer.model, "gpt-5.4-mini");
    assert.equal(saved.overrides.sisyphus.model, "glm-5.2");
    assert.match(explorerText, /model = "upstream-original"/);
    assert.match(sisyphusText, /model = "glm-5\.2"/);
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
