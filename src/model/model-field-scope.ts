import { isLfpOwnedAgent } from "./agent-model-metadata.js";

export const GLOBAL_MODEL_FIELDS = new Set(["model", "model_reasoning_effort", "service_tier"]);
export const UPSTREAM_AGENT_FIELDS = new Set(GLOBAL_MODEL_FIELDS);
export const LFP_OWNED_AGENT_FIELDS = new Set([
  ...GLOBAL_MODEL_FIELDS,
  "model_fallback",
  "model_fallback_reasoning_effort",
  "model_fallback_service_tier"
]);
export const AGENT_MODEL_FIELDS = UPSTREAM_AGENT_FIELDS;
export const VIRTUAL_OVERRIDE_SECTIONS = new Set(["default", "ulw"]);

export function getAgentModelFields(agentName) {
  return isLfpOwnedAgent(agentName) ? LFP_OWNED_AGENT_FIELDS : UPSTREAM_AGENT_FIELDS;
}
