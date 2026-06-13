const HIGH_MAX_REASONING_MODEL_PREFIXES = ["glm-"];

export function getCompatibleReasoningEffort(model, reasoning) {
  if (reasoning === "xhigh" && HIGH_MAX_REASONING_MODEL_PREFIXES.some((prefix) => model?.startsWith(prefix))) {
    return "high";
  }
  return reasoning;
}
