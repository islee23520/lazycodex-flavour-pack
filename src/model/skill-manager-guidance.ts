import path from "node:path";

const TRIGGER =
  /\b(?:skill manager|skill-manager|skills?|restore skill|find skill|archived skill|disabled skill)\b|(?:스킬|자동정리|스킬\s*정리)/i;
const GUIDANCE_MARKER = "<lfp-skill-manager-guidance>";

const GUIDANCE = `<lfp-skill-manager-guidance>
For skill management, avoid bulk-loading every available skill. Inspect only the requested skill, search archived/library folders before restoring, and run \`lfp skill-manager --check\` before any cleanup. Use \`lfp skill-manager --apply\` only for explicit reversible cleanup of invalid active skill folders.
</lfp-skill-manager-guidance>`;

export function runSkillManagerGuidance(input = {}) {
  if (input?.hook_event_name !== "UserPromptSubmit") return { emit: false, reason: "wrong-event" };
  const text = readPromptText(input);
  if (text.length === 0) return { emit: false, reason: "no-text" };
  if (text.includes(GUIDANCE_MARKER)) return { emit: false, reason: "already-present" };
  if (!TRIGGER.test(text)) return { emit: false, reason: "no-trigger" };

  return {
    emit: true,
    guidance: GUIDANCE,
    marker: GUIDANCE_MARKER
  };
}

function readPromptText(input) {
  return (input.prompt || input.message || input.transcript || "").toString();
}

if (
  process.argv[1] !== undefined &&
  (import.meta.url === `file://${process.argv[1]}` || path.basename(process.argv[1]) === "skill-manager-guidance.mjs")
) {
  const input = process.argv[2]
    ? { hook_event_name: "UserPromptSubmit", prompt: process.argv.slice(2).join(" ") }
    : { hook_event_name: "UserPromptSubmit", prompt: "" };
  console.log(JSON.stringify(runSkillManagerGuidance(input), null, 2));
}
