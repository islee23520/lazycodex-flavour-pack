export const GLOBAL_MODEL_FIELDS = new Set(["model", "model_reasoning_effort", "service_tier"]);
export const UPSTREAM_AGENT_FIELDS = new Set(GLOBAL_MODEL_FIELDS);
export const AGENT_MODEL_FIELDS = UPSTREAM_AGENT_FIELDS;
export const VIRTUAL_OVERRIDE_SECTIONS = new Set(["default", "ulw"]);

export function getAgentModelFields(_agentName) {
  return AGENT_MODEL_FIELDS;
}
