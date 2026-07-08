import path from "node:path";
const TRIGGER = /\b(?:quota|rate.?limit|429|too many|model failed|provider error|api error|timeout|context.*exceeded|fallback|switch model|different model)\b/i;
const GUIDANCE = `<lfp-model-fallback-guidance>
When you hit quota, rate-limit, 429, provider failure, or model errors for a LazyCodex/OMO agent, inspect the saved LFP model override config and switch to that agent's configured fallback chain. The declarative fallback chain in lfp-fallback-chains.toml may provide multiple ordered fallback models — try them in order. If no fallback chain is configured, report the primary model and the provider failure clearly instead of guessing a replacement.
</lfp-model-fallback-guidance>`;
const GUIDANCE_MARKER = "<lfp-model-fallback-guidance>";
export function runModelFallbackGuidance(input = {}) {
    const text = (input.prompt || input.message || input.transcript || "").toString();
    if (!text)
        return { emit: false, reason: "no-text" };
    if (text.includes(GUIDANCE_MARKER))
        return { emit: false, reason: "already-present" };
    if (!TRIGGER.test(text))
        return { emit: false, reason: "no-trigger" };
    return {
        emit: true,
        guidance: GUIDANCE,
        marker: GUIDANCE_MARKER,
        resolver_tool: null
    };
}
if (process.argv[1] !== undefined &&
    (import.meta.url === `file://${process.argv[1]}` || path.basename(process.argv[1]) === "model-fallback-guidance.mjs")) {
    const input = process.argv[2] ? { prompt: process.argv.slice(2).join(" ") } : { prompt: "" };
    console.log(JSON.stringify(runModelFallbackGuidance(input), null, 2));
}
