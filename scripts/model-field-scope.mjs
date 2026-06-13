export const GLOBAL_MODEL_FIELDS = new Set(["model", "model_reasoning_effort", "service_tier"]);
export const AGENT_MODEL_FIELDS = new Set([
  ...GLOBAL_MODEL_FIELDS,
  "model_fallback",
  "model_fallback_reasoning_effort",
  "model_fallback_service_tier"
]);
export const VIRTUAL_OVERRIDE_SECTIONS = new Set(["default", "ulw"]);
