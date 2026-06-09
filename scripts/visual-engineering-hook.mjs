#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const VISUAL_PATTERN =
  /\b(?:visual(?:\s+qa|\s+check(?:ing)?|\s+engineering)?|vision(?:\s+check(?:ing)?)?|frontend|front-end|ui|ux|css|layout|responsive|screenshot|figma|art\s+(?:direction|work|asset|polish)|artwork|sprite|illustration|qa\s+session|review(?:er|-work)?|final\s+verdict|ulw)\b|비주얼|비전|프론트엔드|화면|레이아웃|아트|스프라이트|일러스트|검수|리뷰어|최종\s*판정/i;
const GUIDANCE_MARKER = "<lfp-visual-engineering-guidance>";
const LEGACY_GUIDANCE_MARKERS = ["<linalab-visual-engineering-guidance>"];
const TRANSCRIPT_SEARCH_BYTES = 512_000;
const CONTEXT_PRESSURE_MARKERS = [
  "context compacted",
  "context_length_exceeded",
  "skill descriptions were shortened",
  "context_too_large",
  "codex ran out of room in the model's context window",
  "your input exceeds the context window",
  "long threads and multiple compactions"
];
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VISUAL_ENGINEERING_CONFIG = path.join(ROOT, "agent-configs", "visual-engineering.toml");
const VISUAL_LOOKER_CONFIG = path.join(ROOT, "agent-configs", "visual-looker.toml");

const GUIDANCE = `${GUIDANCE_MARKER}

For any visual judgment, QA, comparison, diagram review, image analysis, layout checks, screenshot verification, chart reading, art/illustration review, game asset inspection, or visual acceptance criteria (not limited to UI/UX), use the LFP vision specialist agent (generic for all visual artifacts). Spawn it with agent_type="visual-engineering"; its role config is ${VISUAL_ENGINEERING_CONFIG}.

For QA sessions, reviewer passes, final verdicts, and ULW completion involving any visual content (UI, art, screenshots, documents, diagrams, images), require a visual reviewer pass (using visual-engineering for judgment/acceptance and visual-looker for concrete evidence extraction) before the final verdict. Always ground findings in observable evidence (exact text, coordinates, contrast, data points, structural deltas) and produce structured output consumable by the root agent.

For screenshot, image, document, or diagram inspection where the main need is to describe visible evidence, use the LFP vision looker. Spawn it with agent_type="visual-looker"; its role config is ${VISUAL_LOOKER_CONFIG}. Keep root-agent ownership of integration and final verification.

These vision agents default to Gemini models (gemini-3.1-pro-preview and equivalents) in their role configs because Gemini provides superior detailed visual understanding, evidence extraction from screenshots/diagrams/charts, layout analysis, and verification tasks. Your active model_provider (e.g. cliproxyapi or a Google-compatible provider) must be configured to route the Gemini model name. 

If your provider does not support Gemini routing, install and configure the codex-xai-oauth@linalab plugin (run its setup) to enable Grok vision models as fallback, and point the vision agent configs at suitable Grok models. Run \`lfp setup\` or \`lfp doctor\` to install LFP-owned agents and apply model overrides; this hook only adds guidance and does not mutate LazyCodex/OMO state.

For vision work with OAuth-backed providers, ensure codex-xai-oauth@linalab (or equivalent) is enabled in your Codex config before spawning vision agents.

For ulw-plan work, once the plan draft is done, always run a high-accuracy review before treating the plan as ready to execute. Incorporate required corrections from that review into the final plan.`;

if (isDirectRun()) {
  const input = readStdinJson();
  const output = runUserPromptSubmitHook(input);
  if (output.length > 0) process.stdout.write(output);
}

export function runUserPromptSubmitHook(value) {
  if (!isHookInput(value)) return "";
  if (isContextPressure(value.prompt)) return "";
  if (!VISUAL_PATTERN.test(value.prompt)) return "";
  if (hasGuidanceAlready(value.transcript_path)) return "";

  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: GUIDANCE
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

function hasGuidanceAlready(transcriptPath) {
  if (typeof transcriptPath !== "string") return false;
  try {
    const transcript = readFileSync(transcriptPath);
    const tail = transcript
      .subarray(Math.max(0, transcript.byteLength - TRANSCRIPT_SEARCH_BYTES))
      .toString("utf8");
    return [GUIDANCE_MARKER, ...LEGACY_GUIDANCE_MARKERS].some((marker) => tail.includes(marker));
  } catch {
    return false;
  }
}

function isContextPressure(prompt) {
  const normalized = prompt.toLowerCase();
  return CONTEXT_PRESSURE_MARKERS.some((marker) => normalized.includes(marker));
}

function isHookInput(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.hook_event_name === "UserPromptSubmit" &&
    typeof value.prompt === "string" &&
    (value.transcript_path === undefined ||
      value.transcript_path === null ||
      typeof value.transcript_path === "string")
  );
}

function isDirectRun() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
