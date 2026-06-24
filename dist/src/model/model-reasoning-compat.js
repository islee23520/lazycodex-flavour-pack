const MODELS_WITHOUT_REASONING_EFFORT = [/^glm[-_.]/i, /^gemini[-_.]/i];
export function getCompatibleReasoningEffort(model, reasoning) {
    if (MODELS_WITHOUT_REASONING_EFFORT.some((pattern) => pattern.test(model ?? ""))) {
        return null;
    }
    return reasoning;
}
