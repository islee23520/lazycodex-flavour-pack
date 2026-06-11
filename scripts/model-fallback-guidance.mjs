#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RESOLVER_PATH = path.join(ROOT, "scripts", "mcp-model-fallback.mjs");

const TRIGGER =
  /\b(?:quota|rate.?limit|429|too many|model failed|provider error|api error|timeout|context.*exceeded|fallback|switch model|different model)\b/i;

const GUIDANCE = `<lfp-model-fallback-guidance>
When you hit quota, rate-limit, 429, provider failure, or any model error for a specific agent (explorer, metis, plan, momus, visual-engineering, visual-looker, artistry-*, etc.), call the LFP model_fallback_resolver tool immediately.

Tool: model_fallback_resolver
Input example:
  { "agent": "explorer", "reason": "quota" }
  { "agent": "visual-engineering", "reason": "429" }
  { "agent": "plan", "reason": "rate-limit" }

The tool reads the user's saved LFP model override config and returns:
- primary (your preferred model for that agent)
- effective (the one you should use right now)
- using_fallback: true/false
- fallback_available: true if a fallback is defined for this agent

Use the "effective" model for the next attempt on that agent. Do not hardcode models. Always prefer the resolver result over guessing.

Resolver script (for manual/debug): ${RESOLVER_PATH}
</lfp-model-fallback-guidance>`;

const GUIDANCE_MARKER = "<lfp-model-fallback-guidance>";

export function runModelFallbackGuidance(input = {}) {
  const text = (input.prompt || input.message || input.transcript || "").toString();
  if (!text) return { emit: false, reason: "no-text" };
  if (text.includes(GUIDANCE_MARKER)) return { emit: false, reason: "already-present" };
  if (!TRIGGER.test(text)) return { emit: false, reason: "no-trigger" };

  return {
    emit: true,
    guidance: GUIDANCE,
    marker: GUIDANCE_MARKER,
    resolver_tool: "model_fallback_resolver"
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2] ? { prompt: process.argv.slice(2).join(" ") } : { prompt: "" };
  console.log(JSON.stringify(runModelFallbackGuidance(input), null, 2));
}
