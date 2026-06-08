#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getPendingCodexPluginActions, installCodexPlugin } from "./codex-plugin-install.mjs";
import { syncAgentOverrides } from "./sync-agent-overrides.mjs";

const ART_PATTERN =
  /\b(?:art(?:istry|(?:\s+)?team|(?:\s+)?work|(?:\s+)?project|(?:\s+)?asset|(?:\s+)?direction)|draw(?:ing)?|paint(?:ing)?|illustrat(?:e|ion)|sketch|sprite|pixel\s+art|concept\s+art|poster|banner|thumbnail|graphic|visual\s+design|digital\s+art|art\s+team)\b|아트|그림|일러스트|드로잉|페인팅|스케치|포스터|배너|썸네일|픽셀아트|컨셉아트/i;
const GUIDANCE_MARKER = "<lfp-art-team-guidance>";
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
const DEFAULT_CONFIG = path.join(ROOT, "agent-configs", "omo-agent-model-overrides.toml");
const ARTISTRY_CONFIG = path.join(ROOT, "agent-configs", "artistry.toml");
const ARTISTRY_GEN_CONFIG = path.join(ROOT, "agent-configs", "artistry-gen.toml");
const ARTISTRY_QA_CONFIG = path.join(ROOT, "agent-configs", "artistry-qa.toml");

const GUIDANCE = `${GUIDANCE_MARKER}

An art production request was detected. Use the LFP art team agent group for this task.

## Art Team Structure

The art team uses a cost-efficient observe-decide-act loop pattern (reference: pss-mgba harness). Expensive models are called only at checkpoints; cheap models run the inner loop.

1. **artistry** (GPT-5.5, high reasoning) — Art Director. Interprets requests into art briefs, defines production phases with checkpoint criteria, reviews QA results, and makes final completion judgments. Spawn with agent_type="artistry"; config at ${ARTISTRY_CONFIG}. Called 2-3 times total.

2. **artistry-gen** (GLM-5v-turbo, medium reasoning) — Production Worker. Operates the user's creative application via Computer Use. Learns tool UI, executes production directives, reports progress at checkpoints. Spawn with agent_type="artistry-gen"; config at ${ARTISTRY_GEN_CONFIG}. Called many times in the inner loop.

3. **artistry-qa** (Grok 4.3, high reasoning) — Visual QA Inspector. Compares screenshots against art brief criteria, provides structured PASS/FAIL/STUCK verdicts with pixel-level evidence. Spawn with agent_type="artistry-qa"; config at ${ARTISTRY_QA_CONFIG}. Called at each checkpoint.

## Loop Protocol

\`\`\`
1. Spawn artistry with the user's request → art brief + production phases
2. For each phase:
   a. Send directive to artistry-gen → Computer Use loop (observe → act → verify → repeat)
   b. At checkpoint: spawn artistry-qa with screenshot + criteria → verdict
   c. PASS → next phase. FAIL → revision directive to artistry-gen. STUCK → artistry intervenes.
   d. Max 3 revision cycles per phase before forced advancement.
3. After all phases: final QA pass → artistry judges completion.
\`\`\`

## Cost Discipline

- GPT-5.5 (artistry): called ONLY for brief creation, checkpoint reviews, and final judgment. Never in the inner loop.
- GLM-5v-turbo (artistry-gen): runs the inner Computer Use loop. Cheap and fast.
- Grok 4.3 (artistry-qa): called ONLY at phase checkpoints for structured inspection.

## Key Patterns (from pss-mgba harness)

- **Observe before act**: always screenshot current state before any tool action.
- **Verify after act**: screenshot after each action to confirm expected change.
- **Stuck detection**: if 3 consecutive actions produce no state change, report STUCK.
- **Undo on failure**: unexpected result → undo immediately → try different approach.
- **Serial execution**: one action at a time, never queue uncertain actions.
- **Evidence-bound checkpoints**: every QA verdict must include pixel coordinates, color values, or measurable proportions.

These art team agents default to GLM-5v-turbo (worker), Grok 4.3 (QA), and GPT-5.5 (director) in their role configs. Your active model_provider must be configured to route these model names. If your provider does not support GLM routing, point artistry-gen at a suitable cheap vision model. If Grok is unavailable, point artistry-qa at a strong vision-capable model.

The hook self-heals LFP plugin install and model overrides on any art prompt.`;

if (isDirectRun()) {
  const input = readStdinJson();
  const output = runArtTeamHook(input);
  if (output.length > 0) process.stdout.write(output);
}

export function runArtTeamHook(value, options = {}) {
  if (!isHookInput(value)) return "";
  ensureLfpSetupCurrent(options);
  if (isContextPressure(value.prompt)) return "";
  if (!ART_PATTERN.test(value.prompt)) return "";
  if (hasGuidanceAlready(value.transcript_path)) return "";

  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: GUIDANCE
    }
  })}\n`;
}

function ensureLfpSetupCurrent(options) {
  const configPath = options.configPath ?? DEFAULT_CONFIG;
  const packageRoot = options.packageRoot ?? ROOT;
  const pluginOptions = options.env === undefined ? { packageRoot } : { env: options.env, packageRoot };

  try {
    const pending = getPendingCodexPluginActions(pluginOptions);
    const pendingOverrides = syncAgentOverrides(configPath, { check: true });
    if (pending.actions.length === 0 && pendingOverrides.changed.length === 0) return;

    installCodexPlugin(packageRoot, pluginOptions);
    syncAgentOverrides(configPath, { check: false });
  } catch {
    return;
  }
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
