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

export const ModelOverrideConfigSchema = z.object({
  source: z.object({
    agentsDir: z.string().min(1).optional()
  }).optional(),
  overrides: z.record(z.string().min(1), ModelOverrideFieldsSchema).default({})
});

export const SavedUserModelOverrideConfigSchema = z.object({
  schemaVersion: z.literal(1),
  overrides: z.record(z.string().min(1), ModelOverrideFieldsSchema).default({})
}).strict();

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
  const result = SavedUserModelOverrideConfigSchema.safeParse(config);
  if (result.success) {
    validateAgentNames(result.data.overrides);
    return result.data;
  }

  const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new TypeError(`Invalid model override config: ${issues}`);
}
