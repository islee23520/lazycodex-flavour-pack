import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runUserPromptSubmitHook } from "../scripts/visual-engineering-hook.mjs";

const lfpHooks = JSON.parse(readFileSync(path.resolve("hooks/hooks.json"), "utf8"));
const lazyCodexUserPromptSubmitHooks = [
  { hooks: [{ type: "command", command: "node \"${PLUGIN_ROOT}/components/rules/dist/cli.js\" hook user-prompt-submit" }] },
  { hooks: [{ type: "command", command: "node \"${PLUGIN_ROOT}/components/ultrawork/dist/cli.js\" hook user-prompt-submit" }] },
  { hooks: [{ type: "command", command: "node \"${PLUGIN_ROOT}/components/ulw-loop/dist/cli.js\" hook user-prompt-submit" }] }
];

test("given visual code work prompt when hook runs then emits visual-engineering guidance", () => {
  const output = runUserPromptSubmitHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Update the React layout and run visual QA against screenshots."
  });

  const parsed = JSON.parse(output);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(parsed.hookSpecificOutput.additionalContext, /visual-engineering/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="visual-engineering"/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent-configs\/visual-engineering\.toml/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /visual-looker/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="visual-looker"/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent-configs\/visual-looker\.toml/);
});

test("given art work prompt when hook runs then emits visual-engineering guidance", () => {
  const output = runUserPromptSubmitHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Please help with art direction and sprite polish for this asset."
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="visual-engineering"/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="visual-looker"/);
});

test("given Korean art work prompt when hook runs then emits visual-engineering guidance", () => {
  const output = runUserPromptSubmitHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "캐릭터 아트 작업 품질 확인해줘."
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="visual-engineering"/);
});

test("given QA session prompt when hook runs then requires visual reviewer coverage", () => {
  const output = runUserPromptSubmitHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Start a QA session for this game asset and produce the final verdict."
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /visual reviewer/i);
  assert.match(parsed.hookSpecificOutput.additionalContext, /final verdict/i);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="visual-engineering"/);
});

test("given ULW reviewer prompt when hook runs then requires final visual verdict", () => {
  const output = runUserPromptSubmitHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Run ulw review-work and make the reviewer final verdict check visual quality."
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /ULW/i);
  assert.match(parsed.hookSpecificOutput.additionalContext, /visual reviewer/i);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="visual-looker"/);
});

test("given full Codex ULW visual payload when hook runs then emits UserPromptSubmit additional context", () => {
  const output = runUserPromptSubmitHook({
    hook_event_name: "UserPromptSubmit",
    session_id: "session-test",
    turn_id: "turn-test",
    cwd: "/tmp/project",
    model: "gpt-5.5",
    permission_mode: "default",
    transcript_path: null,
    prompt: "Run ulw review-work and check UI screenshot alignment before final verdict."
  });

  const parsed = JSON.parse(output);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-visual-engineering-guidance>/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /ULW completion/i);
  assert.doesNotMatch(parsed.hookSpecificOutput.additionalContext, /<ultrawork-mode>/);
});

test("given ULW plan prompt when hook runs then requires high accuracy review after draft", () => {
  const output = runUserPromptSubmitHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Use ulw-plan to draft the implementation plan for this feature."
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /ulw-plan/i);
  assert.match(parsed.hookSpecificOutput.additionalContext, /plan draft/i);
  assert.match(parsed.hookSpecificOutput.additionalContext, /high-accuracy review/i);
});

test("given LFP and LazyCodex hooks when manifests are inspected then they coexist as UserPromptSubmit siblings", () => {
  const lfpUserPromptSubmit = lfpHooks.hooks.UserPromptSubmit;

  assert.equal(lfpUserPromptSubmit.length, 1);
  assert.equal(lfpUserPromptSubmit[0].hooks.length, 1);
  assert.equal(lfpUserPromptSubmit[0].hooks[0].type, "command");
  assert.match(lfpUserPromptSubmit[0].hooks[0].command, /\$\{PLUGIN_ROOT\}\/scripts\/user-prompt-submit\.mjs/);
  assert.equal(lfpUserPromptSubmit[0].hooks[0].timeout, 10);
  assert.equal(lfpUserPromptSubmit[0].matcher, undefined);
  assert.equal(lfpHooks.hooks.SessionStart[0].hooks.length, 1);
  assert.match(lfpHooks.hooks.SessionStart[0].hooks[0].command, /\$\{PLUGIN_ROOT\}\/scripts\/sync-agent-overrides-hook\.mjs/);
  assert.equal(lazyCodexUserPromptSubmitHooks.length, 3);
  assert.match(JSON.stringify(lazyCodexUserPromptSubmitHooks), /ultrawork\/dist\/cli\.js/);
  assert.match(JSON.stringify(lazyCodexUserPromptSubmitHooks), /ulw-loop\/dist\/cli\.js/);
});

test("given non-visual prompt when hook runs then stays quiet", () => {
  const output = runUserPromptSubmitHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Refactor the backend repository class."
  });

  assert.equal(output, "");
});

test("given transcript already has guidance when hook runs then does not repeat", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-visual-hook-"));
  try {
    const transcriptPath = path.join(root, "transcript.jsonl");
    writeFileSync(transcriptPath, "<lfp-visual-engineering-guidance>\n");

    const output = runUserPromptSubmitHook({
      hook_event_name: "UserPromptSubmit",
      prompt: "Check UI screenshot alignment.",
      transcript_path: transcriptPath
    });

    assert.equal(output, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given transcript has legacy Linalab guidance marker when ULW hook runs then does not repeat", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-visual-hook-"));
  try {
    const transcriptPath = path.join(root, "transcript.jsonl");
    writeFileSync(transcriptPath, "<linalab-visual-engineering-guidance>\n");

    const output = runUserPromptSubmitHook({
      hook_event_name: "UserPromptSubmit",
      prompt: "ulw review-work visual QA final verdict for this UI screenshot",
      transcript_path: transcriptPath
    });

    assert.equal(output, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given transcript only has LazyCodex ultrawork marker when ULW visual hook runs then emits LFP guidance", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-visual-hook-"));
  try {
    const transcriptPath = path.join(root, "transcript.jsonl");
    writeFileSync(transcriptPath, "<ultrawork-mode>\nLazyCodex ultrawork context\n");

    const output = runUserPromptSubmitHook({
      hook_event_name: "UserPromptSubmit",
      prompt: "ulw review-work visual QA final verdict for this UI screenshot",
      transcript_path: transcriptPath
    });

    const parsed = JSON.parse(output);
    assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-visual-engineering-guidance>/);
    assert.match(parsed.hookSpecificOutput.additionalContext, /visual reviewer/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given stale explorer override when non-visual hook runs then it does not mutate upstream state", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-visual-hook-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sourceDir = path.join(root, "agents");
    const configPath = path.join(root, "overrides.json");
    const explorerPath = path.join(sourceDir, "explorer.toml");
    mkdirSync(sourceDir);
    writeFileSync(explorerPath, 'name = "explorer"\nmodel = "gpt-5.4-mini"\n');
    writeFileSync(
      configPath,
      JSON.stringify({
        source: { agentsDir: sourceDir },
        overrides: { explorer: { model: "grok-4.3" } }
      })
    );

    const output = runUserPromptSubmitHook({
      hook_event_name: "UserPromptSubmit",
      prompt: "Refactor the backend repository class."
    });
    const updated = readFileSync(explorerPath, "utf8");

    assert.equal(output, "");
    assert.match(updated, /model = "gpt-5\.4-mini"/);
    assert.equal(existsSync(path.join(codexHome, "local-marketplaces", "islee23520", "plugins", "lfp", ".codex-plugin", "plugin.json")), false);
    assert.equal(existsSync(path.join(codexHome, "agents", "visual-engineering.toml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
