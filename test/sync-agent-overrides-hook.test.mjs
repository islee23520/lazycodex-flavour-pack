import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runArtTeamHook } from "../scripts/art-team-hook.mjs";
import { runModelFallbackGuidance } from "../scripts/model-fallback-guidance.mjs";
import { runOverrideSyncHook } from "../scripts/sync-agent-overrides-hook.mjs";
import { runUserPromptSubmitHook } from "../scripts/visual-engineering-hook.mjs";

test("given SessionStart hook when override is pending then applies model fields quietly", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-sync-hook-"));
  try {
    const fixture = createFixture(root, "gpt-5.4-mini");

    const output = runOverrideSyncHook(
      { hook_event_name: "SessionStart" },
      { configPath: fixture.configPath, env: { CODEX_HOME: path.join(root, "codex-home"), HOME: root } }
    );
    const updated = readFileSync(fixture.agentPath, "utf8");

    assert.equal(output, "");
    assert.match(updated, /model = "gemini-pro-agent"/);
    assert.match(updated, /model_reasoning_effort = "high"/);
    assert.match(updated, /service_tier = "default"/);
    assert.match(updated, /model_fallback = "gemini-fallback-agent"/);
    assert.match(updated, /model_fallback_reasoning_effort = "medium"/);
    assert.match(updated, /model_fallback_service_tier = "fast"/);
    assert.match(updated, /developer_instructions = """keep me"""/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given UserPromptSubmit hook when saved override exists then saved model wins quietly", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-sync-hook-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const fixture = createFixture(root, "gpt-5.4-mini");
    const savedPath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");
    mkdirSync(path.dirname(savedPath), { recursive: true });
    writeFileSync(
      savedPath,
      `${JSON.stringify({
        schemaVersion: 1,
        overrides: {
          "visual-looker": {
            model: "gemini-saved-agent",
            model_reasoning_effort: "medium",
            service_tier: "fast",
            model_fallback: "gemini-saved-fallback",
            model_fallback_reasoning_effort: "low",
            model_fallback_service_tier: "default"
          }
        }
      }, null, 2)}\n`
    );

    const output = runOverrideSyncHook(
      { hook_event_name: "UserPromptSubmit" },
      { configPath: fixture.configPath, env: { CODEX_HOME: codexHome, HOME: root } }
    );
    const updated = readFileSync(fixture.agentPath, "utf8");

    assert.equal(output, "");
    assert.match(updated, /model = "gemini-saved-agent"/);
    assert.match(updated, /model_reasoning_effort = "medium"/);
    assert.match(updated, /service_tier = "fast"/);
    assert.match(updated, /model_fallback = "gemini-saved-fallback"/);
    assert.match(updated, /model_fallback_reasoning_effort = "low"/);
    assert.match(updated, /model_fallback_service_tier = "default"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given unsupported hook event when sync hook runs then it stays quiet without changes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-sync-hook-"));
  try {
    const fixture = createFixture(root, "gpt-5.4-mini");

    const output = runOverrideSyncHook(
      { hook_event_name: "Other" },
      { configPath: fixture.configPath, env: { CODEX_HOME: path.join(root, "codex-home"), HOME: root } }
    );
    const updated = readFileSync(fixture.agentPath, "utf8");

    assert.equal(output, "");
    assert.match(updated, /model = "gpt-5\.4-mini"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given visual art and fallback guidance hooks when they run then they do not mutate agent TOMLs", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-guidance-hooks-"));
  try {
    const fixture = createFixture(root, "gpt-5.4-mini");
    const before = readFileSync(fixture.agentPath, "utf8");

    const visualOutput = runUserPromptSubmitHook({
      hook_event_name: "UserPromptSubmit",
      prompt: "please run visual QA on this UI"
    });
    const artOutput = runArtTeamHook({
      hook_event_name: "UserPromptSubmit",
      prompt: "make a sprite and illustration asset"
    });
    const fallbackOutput = runModelFallbackGuidance({
      hook_event_name: "UserPromptSubmit",
      prompt: "quota 429, switch model fallback for visual-looker"
    });
    const after = readFileSync(fixture.agentPath, "utf8");

    assert.match(visualOutput, /hookSpecificOutput/);
    assert.match(artOutput, /hookSpecificOutput/);
    assert.equal(fallbackOutput.emit, true);
    assert.match(fallbackOutput.guidance, /model_fallback_resolver/);
    assert.equal(after, before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createFixture(root, currentModel) {
  const agentsDir = path.join(root, "agents");
  const agentPath = path.join(agentsDir, "visual-looker.toml");
  const configPath = path.join(root, "overrides.toml");
  mkdirSync(agentsDir);
  writeFileSync(
    agentPath,
    [
      'name = "visual-looker"',
      `model = "${currentModel}"`,
      'model_reasoning_effort = "low"',
      'service_tier = "fast"',
      'developer_instructions = """keep me"""',
      ""
    ].join("\n")
  );
  writeFileSync(
    configPath,
    [
      "[source]",
      `agents_dir = "${agentsDir}"`,
      "",
      "[agents.visual-looker]",
      'model = "gemini-pro-agent"',
      'model_reasoning_effort = "high"',
      'service_tier = "default"',
      'model_fallback = "gemini-fallback-agent"',
      'model_fallback_reasoning_effort = "medium"',
      'model_fallback_service_tier = "fast"',
      ""
    ].join("\n")
  );
  return { agentPath, configPath };
}
