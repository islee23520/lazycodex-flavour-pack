export const ReasoningEffortSchema = ["low", "medium", "high", "xhigh"];
export const ServiceTierSchema = ["default", "fast"];

export const AGENT_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

const ModelOverrideFieldsKeys = [
  "model",
  "model_reasoning_effort",
  "service_tier",
  "model_fallback",
  "model_fallback_reasoning_effort",
  "model_fallback_service_tier"
];

function isStringRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickModelOverrideFields(value, path) {
  const result = {};
  if (value.model !== undefined) {
    if (typeof value.model !== "string" || value.model.length === 0) {
      throw new TypeError(`${path}.model: expected a non-empty string`);
    }
    result.model = value.model;
  }
  if (value.model_reasoning_effort !== undefined) {
    if (
      typeof value.model_reasoning_effort !== "string" ||
      !ReasoningEffortSchema.includes(value.model_reasoning_effort)
    ) {
      throw new TypeError(`${path}.model_reasoning_effort: must be one of ${ReasoningEffortSchema.join(", ")}`);
    }
    result.model_reasoning_effort = value.model_reasoning_effort;
  }
  if (value.service_tier !== undefined) {
    if (typeof value.service_tier !== "string" || !ServiceTierSchema.includes(value.service_tier)) {
      throw new TypeError(`${path}.service_tier: must be one of ${ServiceTierSchema.join(", ")}`);
    }
    result.service_tier = value.service_tier;
  }
  if (value.model_fallback !== undefined) {
    if (typeof value.model_fallback !== "string" || value.model_fallback.length === 0) {
      throw new TypeError(`${path}.model_fallback: expected a non-empty string`);
    }
    result.model_fallback = value.model_fallback;
  }
  if (value.model_fallback_reasoning_effort !== undefined) {
    if (
      typeof value.model_fallback_reasoning_effort !== "string" ||
      !ReasoningEffortSchema.includes(value.model_fallback_reasoning_effort)
    ) {
      throw new TypeError(
        `${path}.model_fallback_reasoning_effort: must be one of ${ReasoningEffortSchema.join(", ")}`
      );
    }
    result.model_fallback_reasoning_effort = value.model_fallback_reasoning_effort;
  }
  if (value.model_fallback_service_tier !== undefined) {
    if (
      typeof value.model_fallback_service_tier !== "string" ||
      !ServiceTierSchema.includes(value.model_fallback_service_tier)
    ) {
      throw new TypeError(`${path}.model_fallback_service_tier: must be one of ${ServiceTierSchema.join(", ")}`);
    }
    result.model_fallback_service_tier = value.model_fallback_service_tier;
  }
  return result;
}

function validateModelOverrideFields(value, path) {
  if (value === undefined || value === null) return {};
  if (!isStringRecord(value)) {
    throw new TypeError(`${path}: expected an object`);
  }
  for (const key of Object.keys(value)) {
    if (!ModelOverrideFieldsKeys.includes(key)) {
      throw new TypeError(`${path}.${key}: unknown field "${key}"`);
    }
  }
  return pickModelOverrideFields(value, path);
}

function validateAgentNames(overrides) {
  for (const name of Object.keys(overrides)) {
    if (!AGENT_NAME_PATTERN.test(name)) {
      throw new TypeError(`Invalid agent name "${name}": must match /^[A-Za-z0-9_-]+$/`);
    }
  }
}

function parseRolePolicyFields(value, path) {
  const result = {};
  if (value === undefined || value === null) return result;
  if (!isStringRecord(value)) throw new TypeError(`${path}: expected an object`);
  for (const key of Object.keys(value)) {
    if (key !== "reasoning" && key !== "tier") {
      throw new TypeError(`${path}.${key}: unknown field "${key}"`);
    }
  }
  if (typeof value.reasoning === "string") {
    if (!ReasoningEffortSchema.includes(value.reasoning)) {
      throw new TypeError(`${path}.reasoning: must be one of ${ReasoningEffortSchema.join(", ")}`);
    }
    result.reasoning = value.reasoning;
  }
  if (typeof value.tier === "string") {
    if (!ServiceTierSchema.includes(value.tier)) {
      throw new TypeError(`${path}.tier: must be one of ${ServiceTierSchema.join(", ")}`);
    }
    result.tier = value.tier;
  }
  return result;
}

function parseStringRecord(value, path) {
  if (!isStringRecord(value)) throw new TypeError(`${path}: expected an object`);
  return value;
}

function parseOverridesRecord(value, path) {
  const raw = parseStringRecord(value, path);
  const overrides = {};
  for (const [name, fields] of Object.entries(raw)) {
    overrides[name] = validateModelOverrideFields(fields, `${path}.${name}`);
  }
  return overrides;
}

function parseRolePoliciesRecord(value, path) {
  const raw = parseStringRecord(value, path);
  const policies = {};
  for (const [name, fields] of Object.entries(raw)) {
    policies[name] = parseRolePolicyFields(fields, `${path}.${name}`);
  }
  return policies;
}

export function parseModelOverrideConfig(config) {
  try {
    const root = parseStringRecord(config, "config");
    const source =
      root.source === undefined || root.source === null
        ? undefined
        : {
            agentsDir: typeof root.source.agentsDir === "string" ? root.source.agentsDir : undefined
          };
    for (const key of Object.keys(root)) {
      if (key !== "source" && key !== "overrides" && key !== "rolePolicies") {
        throw new TypeError(`config: unknown field "${key}"`);
      }
    }
    const overrides = root.overrides === undefined ? {} : parseOverridesRecord(root.overrides, "overrides");
    const rolePolicies =
      root.rolePolicies === undefined ? {} : parseRolePoliciesRecord(root.rolePolicies, "rolePolicies");
    validateAgentNames(overrides);
    return { source, overrides, rolePolicies };
  } catch (error) {
    if (error instanceof TypeError) {
      throw new TypeError(`Invalid model override config: ${error.message}`);
    }
    throw error;
  }
}

export function parseSavedUserModelOverrideConfig(config) {
  const migrated =
    config?.schemaVersion === 1
      ? {
          schemaVersion: 2,
          source: { agentsDir: "${CODEX_HOME}/agents" },
          overrides: config.overrides ?? {},
          rolePolicies: {}
        }
      : config;
  const root = parseStringRecord(migrated, "config");
  if (root.schemaVersion !== 2) {
    throw new TypeError(`config.schemaVersion: expected 2, got ${JSON.stringify(root.schemaVersion)}`);
  }
  for (const key of Object.keys(root)) {
    if (key !== "schemaVersion" && key !== "source" && key !== "overrides" && key !== "rolePolicies") {
      throw new TypeError(`config: unknown field "${key}"`);
    }
  }
  const sourceValue = root.source ?? {};
  const agentsDir = typeof sourceValue.agentsDir === "string" ? sourceValue.agentsDir : "${CODEX_HOME}/agents";
  const overrides = root.overrides === undefined ? {} : parseOverridesRecord(root.overrides, "overrides");
  const rolePolicies =
    root.rolePolicies === undefined ? {} : parseRolePoliciesRecord(root.rolePolicies, "rolePolicies");
  validateAgentNames(overrides);
  return { schemaVersion: 2, source: { agentsDir }, overrides, rolePolicies };
}

export const ModelOverrideConfigSchema = {
  safeParse(config) {
    try {
      return { success: true, data: parseModelOverrideConfig(config) };
    } catch (error) {
      return { success: false, error };
    }
  },
  parse(config) {
    return parseModelOverrideConfig(config);
  }
};

export const SavedUserModelOverrideConfigSchema = {
  safeParse(config) {
    try {
      return { success: true, data: parseSavedUserModelOverrideConfig(config) };
    } catch (error) {
      return { success: false, error };
    }
  },
  parse(config) {
    return parseSavedUserModelOverrideConfig(config);
  }
};

export const LegacyV1SavedUserOverrideConfigSchema = {
  safeParse(config) {
    try {
      return { success: true, data: parseLegacyV1(config) };
    } catch (error) {
      return { success: false, error };
    }
  },
  parse(config) {
    return parseLegacyV1(config);
  }
};

function parseLegacyV1(config) {
  const root = parseStringRecord(config, "config");
  if (root.schemaVersion !== 1) {
    throw new TypeError(`config.schemaVersion: expected 1, got ${JSON.stringify(root.schemaVersion)}`);
  }
  for (const key of Object.keys(root)) {
    if (key !== "schemaVersion" && key !== "overrides") {
      throw new TypeError(`config: unknown field "${key}"`);
    }
  }
  const overrides = root.overrides === undefined ? {} : parseOverridesRecord(root.overrides, "overrides");
  validateAgentNames(overrides);
  return { schemaVersion: 1, overrides };
}

export const RolePolicyOverrideFieldsSchema = {
  safeParse(config) {
    try {
      return { success: true, data: parseRolePolicyFields(config, "rolePolicy") };
    } catch (error) {
      return { success: false, error };
    }
  },
  parse(config) {
    return parseRolePolicyFields(config, "rolePolicy");
  }
};
