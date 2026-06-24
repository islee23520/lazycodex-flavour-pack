import { z } from "zod";
export const ReasoningEffortSchema = z.enum(["low", "medium", "high", "xhigh"]);
export const ServiceTierSchema = z.enum(["default", "fast"]);
export const AGENT_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
export const ModelOverrideFieldsSchema = z.object({
    model: z.string().min(1).optional(),
    model_reasoning_effort: ReasoningEffortSchema.optional(),
    service_tier: ServiceTierSchema.optional(),
    model_fallback: z.string().min(1).optional(),
    model_fallback_reasoning_effort: ReasoningEffortSchema.optional(),
    model_fallback_service_tier: ServiceTierSchema.optional()
});
function validateAgentNames(overrides) {
    for (const name of Object.keys(overrides)) {
        if (!AGENT_NAME_PATTERN.test(name)) {
            throw new TypeError(`Invalid agent name "${name}": must match /^[A-Za-z0-9_-]+$/`);
        }
    }
}
export const RolePolicyOverrideFieldsSchema = z
    .object({
    reasoning: z.enum(["low", "medium", "high", "xhigh"]).optional(),
    tier: z.enum(["fast", "default"]).optional()
})
    .strict();
export const ModelOverrideConfigSchema = z.object({
    source: z
        .object({
        agentsDir: z.string().min(1).optional()
    })
        .optional(),
    overrides: z.record(z.string().min(1), ModelOverrideFieldsSchema).default({}),
    rolePolicies: z.record(z.string().min(1), RolePolicyOverrideFieldsSchema).default({})
});
export const SavedUserModelOverrideConfigSchema = z
    .object({
    schemaVersion: z.literal(2),
    source: z
        .object({
        agentsDir: z.string().default("${CODEX_HOME}/agents")
    })
        .default({ agentsDir: "${CODEX_HOME}/agents" }),
    overrides: z.record(z.string().min(1), ModelOverrideFieldsSchema).default({}),
    rolePolicies: z.record(z.string().min(1), RolePolicyOverrideFieldsSchema).default({})
})
    .strict();
export const LegacyV1SavedUserOverrideConfigSchema = z
    .object({
    schemaVersion: z.literal(1),
    overrides: z.record(z.string().min(1), ModelOverrideFieldsSchema).default({})
})
    .strict();
export function parseModelOverrideConfig(config) {
    const result = ModelOverrideConfigSchema.safeParse(config);
    if (result.success) {
        validateAgentNames(result.data.overrides);
        return result.data;
    }
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new TypeError(`Invalid model override config: ${issues}`);
}
export function parseSavedUserModelOverrideConfig(config) {
    const migrated = config?.schemaVersion === 1
        ? {
            schemaVersion: 2,
            source: { agentsDir: "${CODEX_HOME}/agents" },
            overrides: config.overrides ?? {},
            rolePolicies: {}
        }
        : config;
    const result = SavedUserModelOverrideConfigSchema.safeParse(migrated);
    if (result.success) {
        validateAgentNames(result.data.overrides);
        return result.data;
    }
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new TypeError(`Invalid model override config: ${issues}`);
}
