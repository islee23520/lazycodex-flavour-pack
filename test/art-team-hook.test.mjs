import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runArtTeamHook } from "../scripts/art-team-hook.mjs";

const lfpHooks = JSON.parse(readFileSync(path.resolve("hooks/hooks.json"), "utf8"));

test("given art drawing prompt when hook runs then emits art team guidance", () => {
  const output = runArtTeamHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Draw a cyberpunk city poster with neon signs"
  });

  const parsed = JSON.parse(output);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(parsed.hookSpecificOutput.additionalContext, /<lfp-art-team-guidance>/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="artistry"/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="artistry-gen"/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="artistry-qa"/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent-configs\/artistry\.toml/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent-configs\/artistry-gen\.toml/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent-configs\/artistry-qa\.toml/);
});

test("given illustration prompt when hook runs then emits art team guidance", () => {
  const output = runArtTeamHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Create an illustration for the game character concept art"
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="artistry"/);
});

test("given Korean art prompt when hook runs then emits art team guidance", () => {
  const output = runArtTeamHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "포스터 그려줘, 사이버펑크 도시 야경"
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="artistry"/);
});

test("given Korean drawing prompt when hook runs then emits art team guidance", () => {
  const output = runArtTeamHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "캐릭터 일러스트 작업해줘"
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="artistry"/);
});

test("given sprite pixel art prompt when hook runs then emits art team guidance", () => {
  const output = runArtTeamHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Make a pixel art sprite sheet for the main character"
  });

  const parsed = JSON.parse(output);
  assert.match(parsed.hookSpecificOutput.additionalContext, /agent_type="artistry"/);
});

test("given non-art prompt when hook runs then stays quiet", () => {
  const output = runArtTeamHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Refactor the backend repository class."
  });

  assert.equal(output, "");
});

test("given non-visual coding prompt when hook runs then stays quiet", () => {
  const output = runArtTeamHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Fix the type error in the authentication module"
  });

  assert.equal(output, "");
});

test("given transcript already has art team guidance when hook runs then does not repeat", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-art-hook-"));
  try {
    const transcriptPath = path.join(root, "transcript.jsonl");
    writeFileSync(transcriptPath, "<lfp-art-team-guidance>\n");

    const output = runArtTeamHook({
      hook_event_name: "UserPromptSubmit",
      prompt: "Draw a cyberpunk city poster",
      transcript_path: transcriptPath
    });

    assert.equal(output, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given context pressure prompt when hook runs then stays quiet", () => {
  const output = runArtTeamHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Draw a poster. context compacted"
  });

  assert.equal(output, "");
});

test("given null input when hook runs then stays quiet", () => {
  assert.equal(runArtTeamHook(null), "");
});

test("given malformed input when hook runs then stays quiet", () => {
  assert.equal(runArtTeamHook({}), "");
  assert.equal(runArtTeamHook({ hook_event_name: "Other" }), "");
  assert.equal(runArtTeamHook({ hook_event_name: "UserPromptSubmit" }), "");
});

test("given art team hook in hooks.json when manifest is inspected then it is registered as UserPromptSubmit sibling", () => {
  const lfpUserPromptSubmit = lfpHooks.hooks.UserPromptSubmit;

  assert.equal(lfpUserPromptSubmit.length, 1);
  const hooks = lfpUserPromptSubmit[0].hooks;
  assert.equal(hooks.length, 4);

  const artHook = hooks.find((h) => h.command.includes("art-team-hook"));
  assert.ok(artHook, "art-team-hook should be registered");
  assert.equal(artHook.type, "command");
  assert.match(artHook.command, /\$\{PLUGIN_ROOT\}\/scripts\/art-team-hook\.mjs/);
  assert.equal(artHook.timeout, 5);

  const visualHook = hooks.find((h) => h.command.includes("visual-engineering-hook"));
  assert.ok(visualHook, "visual-engineering-hook should still be registered");
});

test("given art team guidance when emitted then contains loop protocol", () => {
  const output = runArtTeamHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Paint a landscape banner"
  });

  const parsed = JSON.parse(output);
  const ctx = parsed.hookSpecificOutput.additionalContext;

  // Cost discipline section
  assert.match(ctx, /gemini-pro-agent.*artistry.*brief creation.*checkpoint reviews/s);
  assert.match(ctx, /gemini-pro-agent.*artistry-gen.*inner.*loop/s);
  assert.match(ctx, /gemini-pro-agent.*artistry-qa.*checkpoint/s);

  // Loop protocol
  assert.match(ctx, /Spawn artistry.*art brief/s);
  assert.match(ctx, /artistry-gen.*Computer Use loop/s);
  assert.match(ctx, /artistry-qa.*verdict/s);
  assert.match(ctx, /PASS.*FAIL.*STUCK/s);

  // Stuck detection (pss-mgba pattern)
  assert.match(ctx, /3 consecutive actions.*STUCK/i);

  // Evidence-bound checkpoints
  assert.match(ctx, /pixel coordinates|color values|measurable proportions/s);
});

test("given art team guidance when emitted then contains pss-mgba harness patterns", () => {
  const output = runArtTeamHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Sketch a game character concept"
  });

  const parsed = JSON.parse(output);
  const ctx = parsed.hookSpecificOutput.additionalContext;

  assert.match(ctx, /pss-mgba harness/i);
  assert.match(ctx, /observe.*decide.*act/i);
  assert.match(ctx, /Observe before act/i);
  assert.match(ctx, /Verify after act/i);
  assert.match(ctx, /Serial execution/i);
  assert.match(ctx, /Undo on failure/i);
});
