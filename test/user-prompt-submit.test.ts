import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runDispatcher } from "../src/hooks/user-prompt-submit.ts";

test("given non-visual non-art prompt when dispatcher runs then returns empty string", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "hello world xyzzy random text that has no category relevance"
  });

  assert.equal(output, "");
});

test("given visual prompt when dispatcher runs then emits category guidance", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Run visual QA on this UI layout"
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-category-routing-guidance>/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /visual-engineering/);
});

test("given main agent is Hephaestus when fallback dispatcher emits guidance then it preserves main-agent ownership", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Got a 429 quota error, need to switch model",
    main_agent: "hephaestus"
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-main-agent-context>/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /Main agent detected: hephaestus/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /keep task ownership, integration, and final verification/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-model-fallback-guidance>/);
});

test("given art prompt when dispatcher runs then returns empty string", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Draw a cyberpunk city poster"
  });

  assert.equal(output, "");
});

test("given model error prompt when dispatcher runs then emits fallback guidance", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Got a 429 quota error, need to switch model"
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-model-fallback-guidance>/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /saved LFP model override config/);
});

test("given art prompt with model error when dispatcher runs then emits only fallback guidance", async () => {
  const output = await runDispatcher({
    hook_event_name: "UserPromptSubmit",
    prompt: "Draw pixel art sprite for the UI and handle 429 quota"
  });

  const parsed = JSON.parse(output);
  const ctx = parsed.hookSpecificOutput.additionalContext;
  assert.doesNotMatch(ctx, /<lfp-art-team-guidance>|<lfp-visual-engineering-guidance>/);
  assert.match(ctx, /<lfp-model-fallback-guidance>/);
});

test("given null input when dispatcher runs then returns empty string", async () => {
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
    writeFileSync(transcriptPath, "<lfp-model-fallback-guidance>\n");

    const output = await runDispatcher({
      hook_event_name: "UserPromptSubmit",
      prompt: "<lfp-category-routing-guidance>\nhello world xyzzy random text that has no category relevance",
      transcript_path: transcriptPath
    });

    assert.equal(output, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
