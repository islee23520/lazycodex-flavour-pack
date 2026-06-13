import { z } from "zod";

export const ReasoningEffortSchema = z.enum(["low", "medium", "high", "xhigh"]);
export const ServiceTierSchema = z.enum(["default", "fast"]);

export const ModelOverrideFieldsSchema = z.object({
  model: z.string().min(1).optional(),
  model_reasoning_effort: ReasoningEffortSchema.optional(),
  service_tier: ServiceTierSchema.optional(),
  model_fallback: z.string().min(1).optional(),
  model_fallback_reasoning_effort: ReasoningEffortSchema.optional(),
  model_fallback_service_tier: ServiceTierSchema.optional()
});

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
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new TypeError(`Invalid model override config: ${issues}`);
}
