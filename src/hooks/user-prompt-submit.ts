import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runModelFallbackGuidance } from "../model/model-fallback-guidance.js";
import { runCategoryGuidance } from "./category-guidance-hook.js";

if (isDirectRun()) {
  const input = readStdinJson();
  const output = await runDispatcher(input);
  if (output.length > 0) process.stdout.write(output);
}

export async function runDispatcher(value) {
  try {
    const { runOverrideSyncHook } = await import("../model/sync-agent-overrides-hook.js");
    runOverrideSyncHook(value);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
  }

  const mainAgent = getMainAgentName(value, process.env);
  const contexts = [];

  const fallback = value ? runModelFallbackGuidance(value) : { emit: false };
  if (fallback?.emit && fallback.guidance) {
    contexts.push(withMainAgentContext(fallback.guidance, mainAgent));
  }

  if (!fallback?.emit) {
    const category = value ? runCategoryGuidance(value) : { emit: false };
    if (category?.emit && category.guidance) {
      contexts.push(withMainAgentContext(category.guidance, mainAgent));
    }
  }

  if (contexts.length === 0) return "";

  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: contexts.join("\n\n")
    }
  })}\n`;
}

export function getMainAgentName(value, env = process.env) {
  const payloadName = readFirstString(value, [
    "main_agent",
    "main_agent_name",
    "active_agent",
    "active_agent_name",
    "agent",
    "agent_name",
    "subagent_type"
  ]);
  const envName = readFirstString(env, ["LFP_MAIN_AGENT", "CODEX_MAIN_AGENT", "CODEX_AGENT_NAME", "AGENT_NAME"]);
  return normalizeAgentName(payloadName ?? envName);
}

function withMainAgentContext(context, mainAgent) {
  if (mainAgent === null) return context;
  return `<lfp-main-agent-context>
Main agent detected: ${mainAgent}. Treat LFP hook output as delegation guidance; keep task ownership, integration, and final verification with the current main agent.
</lfp-main-agent-context>

${context}`;
}

function readFirstString(value, keys) {
  if (value === null || typeof value !== "object") return null;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
  }
  return null;
}

function normalizeAgentName(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
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
  return (
    process.argv[1] !== undefined &&
    (import.meta.url === pathToFileURL(process.argv[1]).href ||
      path.basename(process.argv[1]) === "user-prompt-submit.mjs")
  );
}
