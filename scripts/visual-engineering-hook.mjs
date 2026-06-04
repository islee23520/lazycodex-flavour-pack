#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const VISUAL_PATTERN =
  /\b(?:visual(?:\s+qa|\s+check(?:ing)?|\s+engineering)?|vision(?:\s+check(?:ing)?)?|frontend|front-end|ui|ux|css|layout|responsive|screenshot|figma|art\s+(?:direction|work|asset|polish)|artwork|sprite|illustration|qa\s+session|review(?:er|-work)?|final\s+verdict|ulw)\b|비주얼|비전|프론트엔드|화면|레이아웃|아트|스프라이트|일러스트|검수|리뷰어|최종\s*판정/i;
const GUIDANCE_MARKER = "<linalab-visual-engineering-guidance>";
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

For frontend/UI code, layout, responsive behavior, or visual QA judgment, prefer the Linalab visual specialist agent. Spawn it with agent_type="visual-engineering"; its role config is ${VISUAL_ENGINEERING_CONFIG}.

For QA sessions, reviewer passes, final verdicts, and ULW completion involving UI, art, screenshots, documents, or other visual output, require a visual reviewer pass before the final verdict. Use visual-engineering for judgment and acceptance criteria.

For ulw-plan work, once the plan draft is done, always run a high-accuracy review before treating the plan as ready to execute. Incorporate required corrections from that review into the final plan.

For screenshot/image/document inspection where the main need is to describe visible evidence, use the Linalab multimodal looker. Spawn it with agent_type="visual-looker"; its role config is ${VISUAL_LOOKER_CONFIG}. Keep root-agent ownership of integration and final verification.`;

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
    return tail.includes(GUIDANCE_MARKER);
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
