export const BENCHMARK_SCENARIOS = {
    explorer: {
        prompt: 'Given this repo map: scripts/cli.mjs is the CLI entrypoint, scripts/sync-agent-overrides.mjs syncs agent TOML files. Return compact JSON with {"path":"<entrypoint>","reason":"<why>"}.',
        checks: ["scripts/cli.mjs", "entrypoint"],
        currentFallback: { model_reasoning_effort: "low", service_tier: "default" }
    },
    librarian: {
        prompt: 'You are checking Node ESM CLI docs from memory. Return compact JSON with {"runtime":"Node ESM","test_runner":"node:test","warning":"cite docs when external claims matter"}.',
        checks: ["Node ESM", "node:test", "cite"],
        currentFallback: { model_reasoning_effort: "medium", service_tier: "default" }
    },
    metis: {
        prompt: 'Audit this config risk: model="glm-5.2", model_reasoning_effort="xhigh" caused an API error because valid levels were low, medium, high. Return compact JSON with {"risk":"<risk>","fix":"<fix>"}.',
        checks: ["xhigh", "high", "risk"],
        currentFallback: { model_reasoning_effort: "high", service_tier: "default" }
    },
    plan: {
        prompt: "Create a compact 3-step plan to benchmark LFP model routing. Include measuring latency, scoring correctness, and applying overrides only when the winner beats current config.",
        checks: ["latency", "score", "overrides"],
        currentFallback: { model_reasoning_effort: "xhigh", service_tier: "default" }
    },
    momus: {
        prompt: 'Review this flawed plan: "Change all agents to the cheapest model without tests." Return compact JSON with {"verdict":"REJECT","reason":"<missing evidence>"}.',
        checks: ["REJECT", "evidence"],
        currentFallback: { model_reasoning_effort: "xhigh", service_tier: "default" }
    },
    "lazycodex-code-reviewer": {
        prompt: 'Strictly review: benchmark command has no dry-run, no secret redaction, and no saved output. Return compact JSON with {"verdict":"FAIL","issues":[...]}',
        checks: ["FAIL", "dry-run", "secret"],
        currentFallback: { model_reasoning_effort: "xhigh", service_tier: "default" }
    }
};
export const DEFAULT_BENCHMARK_ROLES = Object.keys(BENCHMARK_SCENARIOS);
