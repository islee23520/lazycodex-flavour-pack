import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { maybeConfigureOpenCodexSisyphus, selectOmoSisyphusModel } from "../src/codex/sisyphus-main-routing.ts";

test("given OpenCodex is missing when selector accepts then configures Sisyphus main routing", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-sisyphus-routing-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const env = {
      ...process.env,
      CODEX_HOME: codexHome,
      HOME: root,
      LFP_OCX_BIN: process.execPath,
      LFP_OCX_ARGS: JSON.stringify(["-e", "console.log('ocx ensure stub')"])
    };

    const result = await maybeConfigureOpenCodexSisyphus({
      env,
      models: ["zai/glm-5.2[1m]"],
      yesNoSelector: async () => true
    });
    const config = readFileSync(path.join(codexHome, "config.toml"), "utf8");
    const rule = readFileSync(path.join(root, ".opencode", "rules", "hephaestus.md"), "utf8");

    assert.equal(result.configured, true);
    assert.equal(result.prompted, true);
    assert.match(config, /^model_provider = "opencodex"$/m);
    assert.match(config, /^model = "zai\/glm-5\.2\[1m]"$/m);
    assert.doesNotMatch(config, /^model_reasoning_effort = /m);
    assert.doesNotMatch(config, /^service_tier = /m);
    assert.match(rule, /description: OMO Hephaestus baseline discipline for Codex/);
    assert.match(rule, /You are Sisyphus/);
    assert.match(rule, /OpenCodex `zai\/glm-5\.2\[1m]`/);
    assert.match(rule, /Hephaestus is not removed or unavailable/);
    assert.match(rule, /spawn or delegate to the Hephaestus executor role/);
    assert.match(rule, /agent_type: "hephaestus"/);
    assert.match(rule, /lazycodex-executor/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given OpenCodex is active and GPT is available when routing syncs then uses OMO priority over GLM", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-sisyphus-routing-"));
  try {
    const codexHome = path.join(root, "codex-home");
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(path.join(codexHome, "config.toml"), 'model_provider = "opencodex"\n');

    await maybeConfigureOpenCodexSisyphus({
      env: { ...process.env, CODEX_HOME: codexHome, HOME: root },
      models: ["zai/glm-5.2[1m]", "openai/gpt-5.5"]
    });

    const config = readFileSync(path.join(codexHome, "config.toml"), "utf8");
    assert.match(config, /^model = "openai\/gpt-5\.5"$/m);
    assert.match(config, /^model_reasoning_effort = "medium"$/m);
    assert.match(config, /^service_tier = "default"$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given OMO Sisyphus model chain when provider has higher priority model then selects it", () => {
  const selected = selectOmoSisyphusModel(["zai/glm-5.2[1m]", "openai/gpt-5.5", "xai/grok-code-fast-1"]);

  assert.equal(selected, "openai/gpt-5.5");
});

test("given OMO Sisyphus model chain when only GLM match exists then selects GLM variant", () => {
  const selected = selectOmoSisyphusModel(["zai/glm-5.2[1m]", "xai/grok-code-fast-1"]);

  assert.equal(selected, "zai/glm-5.2[1m]");
});

test("given OpenCodex is already active when routing syncs then does not prompt", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-sisyphus-routing-"));
  try {
    const codexHome = path.join(root, "codex-home");
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(
      path.join(codexHome, "config.toml"),
      'model_provider = "opencodex"\nmodel = "anthropic/claude-sonnet-4.5"\n'
    );
    let promptCount = 0;

    const result = await maybeConfigureOpenCodexSisyphus({
      env: { ...process.env, CODEX_HOME: codexHome, HOME: root },
      yesNoSelector: async () => {
        promptCount += 1;
        return true;
      }
    });

    assert.equal(result.configured, true);
    assert.equal(result.prompted, false);
    assert.equal(promptCount, 0);
    assert.equal(existsSync(path.join(root, ".opencode", "rules", "hephaestus.md")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given OpenCodex is missing when selector declines then leaves routing untouched", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-sisyphus-routing-"));
  try {
    const codexHome = path.join(root, "codex-home");

    const result = await maybeConfigureOpenCodexSisyphus({
      env: { ...process.env, CODEX_HOME: codexHome, HOME: root },
      yesNoSelector: async () => false
    });

    assert.deepEqual(result.changed, []);
    assert.equal(result.configured, false);
    assert.equal(existsSync(path.join(codexHome, "config.toml")), false);
    assert.equal(existsSync(path.join(root, ".opencode", "rules", "hephaestus.md")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given no OMO guide match when user has a configured model then uses the user's model instead of a hardcoded default", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-sisyphus-routing-"));
  try {
    const codexHome = path.join(root, "codex-home");
    mkdirSync(codexHome, { recursive: true });
    // user already on opencodex with their own chosen model; provider has no OMO-chain model
    writeFileSync(
      path.join(codexHome, "config.toml"),
      'model_provider = "opencodex"\nmodel = "anthropic/claude-sonnet-4.5"\n'
    );

    const result = await maybeConfigureOpenCodexSisyphus({
      env: { ...process.env, CODEX_HOME: codexHome, HOME: root },
      models: ["xai/grok-code-fast-1"]
    });

    const config = readFileSync(path.join(codexHome, "config.toml"), "utf8");
    assert.equal(result.model, "anthropic/claude-sonnet-4.5");
    assert.match(config, /^model = "anthropic\/claude-sonnet-4\.5"$/m);
    assert.doesNotMatch(config, /glm-5\.2\[1m\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given no OMO guide match and no user-configured model then leaves LazyCodex default intact without forcing a model", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-sisyphus-routing-"));
  try {
    const codexHome = path.join(root, "codex-home");
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(path.join(codexHome, "config.toml"), 'model_provider = "opencodex"\n');

    const result = await maybeConfigureOpenCodexSisyphus({
      env: { ...process.env, CODEX_HOME: codexHome, HOME: root },
      models: ["xai/grok-code-fast-1"]
    });

    const config = readFileSync(path.join(codexHome, "config.toml"), "utf8");
    assert.equal(result.model, null);
    assert.deepEqual(result.changed, []);
    assert.doesNotMatch(config, /^model = /m);
    assert.doesNotMatch(config, /glm-5\.2\[1m\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
