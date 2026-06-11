import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runOverrideSyncHook } from "../scripts/sync-agent-overrides-hook.mjs";

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
            service_tier: "fast"
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
      ""
    ].join("\n")
  );
  return { agentPath, configPath };
}
