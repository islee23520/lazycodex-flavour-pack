import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runDispatcher } from "../scripts/user-prompt-submit.mjs";

test("given non-visual non-art prompt when dispatcher runs then returns empty string", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Refactor the backend repository class."
  });

  assert.equal(output, "");
});

test("given visual prompt when dispatcher runs then emits visual guidance", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Run visual QA on this UI layout"
  });

  const parsed = JSON.parse(output);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-visual-engineering-guidance>/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="visual-engineering"/);
});

test("given main agent is Hephaestus when dispatcher emits guidance then it preserves main-agent ownership", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Run visual QA on this UI layout",
    main_agent: "hephaestus"
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-main-agent-context>/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /Main agent detected: hephaestus/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /keep task ownership, integration, and final verification/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-visual-engineering-guidance>/);
});

test("given active agent is an LFP specialist when dispatcher runs then it does not recursively emit delegation guidance", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Run visual QA on this UI layout",
    active_agent: "visual-engineering"
  });

  assert.equal(output, "");
});

test("given art prompt when dispatcher runs then emits art guidance", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Draw a cyberpunk city poster"
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-art-team-guidance>/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="artistry"/);
});

test("given model error prompt when dispatcher runs then emits fallback guidance", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Got a 429 quota error, need to switch model"
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-model-fallback-guidance>/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /model_fallback_resolver/);
});

test("given prompt matching multiple hooks when dispatcher runs then concatenates all guidance", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Draw pixel art sprite for the UI and handle 429 quota"
  });

  const parsed = JSON.parse(output);
  const ctx = parsed.hookSpecificOutput.additionalContext;
  // Should contain both art and fallback guidance
  assert.match(ctx, /<lfp-art-team-guidance>/);
  assert.match(ctx, /<lfp-model-fallback-guidance>/);
});

test(" given null input when dispatcher runs then returns empty string", async () => {
  assert.equal(await runDispatcher(null), "");
});

test("given malformed input when dispatcher runs then returns empty string", async () => {
  assert.equal(await runDispatcher({}), "");
  assert.equal(await runDispatcher({ hook_event_name: "Other" }), "");
});

test("given context pressure prompt when dispatcher runs then returns empty string", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "context compacted, need to continue"
  });

  assert.equal(output, "");
});

test("given transcript with existing guidance when dispatcher runs then does not repeat guidance", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-dispatcher-"));
  try {
    const transcriptPath = path.join(root, "transcript.jsonl");
    writeFileSync(
      transcriptPath,
      "<lfp-visual-engineering-guidance>\n<lfp-art-team-guidance>\n"
    );

    const output = await runDispatcher({
      hook_event_name: "UserPromptSubmit",
      prompt: "Run visual QA on this UI and draw a sprite",
      transcript_path: transcriptPath
    });

    // Visual and art are deduped; fallback may still emit if trigger matches,
    // but this prompt has no fallback trigger, so output should be empty.
    assert.equal(output, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
