#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { runUserPromptSubmitHook } from "./visual-engineering-hook.mjs";
import { runArtTeamHook } from "./art-team-hook.mjs";
import { runModelFallbackGuidance } from "./model-fallback-guidance.mjs";

if (isDirectRun()) {
  const input = readStdinJson();
  const output = await runDispatcher(input);
  if (output.length > 0) process.stdout.write(output);
}

export async function runDispatcher(value) {
  try {
    const { runOverrideSyncHook } = await import("./sync-agent-overrides-hook.mjs");
    runOverrideSyncHook(value);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
  }

  const contexts = [];

  const visual = runUserPromptSubmitHook(value);
  if (visual) {
    try {
      const parsed = JSON.parse(visual);
      if (parsed?.hookSpecificOutput?.additionalContext) {
        contexts.push(parsed.hookSpecificOutput.additionalContext);
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }

  const art = runArtTeamHook(value);
  if (art) {
    try {
      const parsed = JSON.parse(art);
      if (parsed?.hookSpecificOutput?.additionalContext) {
        contexts.push(parsed.hookSpecificOutput.additionalContext);
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }

  const fallback = value ? runModelFallbackGuidance(value) : { emit: false };
  if (fallback?.emit && fallback.guidance) {
    contexts.push(fallback.guidance);
  }

  if (contexts.length === 0) return "";

  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: contexts.join("\n\n")
    }
  })}\n`;
}

function readStdinJson() {
  const raw = readFileSync(0, "utf8");
  if (raw.trim().length === 0) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isDirectRun() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
