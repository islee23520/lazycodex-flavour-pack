#!/usr/bin/env node
/**
 * LFP MCP Tool: model_fallback_resolver
 *
 * Exposes the existing resolver as a proper tool that Codex can call.
 * Input (via MCP):
 *   { agent: "explorer" | "metis" | ..., reason?: "quota" | "rate-limit" | "429" | "error" | "primary" }
 *
 * Output:
 *   JSON with primary, effective, using_fallback, reason, source, fallback_available
 *
 * This runs locally inside the LFP plugin context, so it sees the user's saved LFP model config.
 */

import { resolve } from "./model-fallback-resolver.mjs";

export async function model_fallback_resolver(params = {}) {
  const { agent, reason, onError } = params || {};
  if (!agent || typeof agent !== "string") {
    return {
      error: "agent is required (string, e.g. explorer, metis, plan, visual-engineering)",
      example: { agent: "explorer", reason: "quota" }
    };
  }
  const effectiveReason = reason || onError || null;
  try {
    const result = resolve(agent, { onError: effectiveReason });
    return {
      ...result,
      tool: "lfp.model_fallback_resolver",
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    return { error: String(e), agent };
  }
}

// If run directly for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = process.argv[2] || "explorer";
  const reason = process.argv[3] || null;
  model_fallback_resolver({ agent, reason }).then(r => console.log(JSON.stringify(r, null, 2)));
}
