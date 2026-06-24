const FAMILY_RULES = [
  { family: "glm", provider: "zai", pattern: /^glm(?:[-_.]|$)/i },
  { family: "grok", provider: "xai", pattern: /^grok(?:[-_.]|$)/i },
  { family: "gemini", provider: "google", pattern: /^gemini(?:[-_.]|$)/i },
  { family: "gpt", provider: "openai", pattern: /^gpt(?:[-_.]|$)/i },
  { family: "claude", provider: "anthropic", pattern: /^claude(?:[-_.]|$)/i }
];

export function classifyModelInventory(models) {
  if (!Array.isArray(models)) return [];
  return models
    .map(classifyModelId)
    .filter((model) => model !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function classifyModelId(value) {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (id.length === 0) return null;

  const modelName = leafModelName(id);
  if (modelName.length === 0) return null;

  const family = classifyFamily(modelName);
  return {
    id,
    provider: family.provider,
    family: family.family,
    capabilities: classifyCapabilities(modelName)
  };
}

function leafModelName(id) {
  const parts = id.split("/");
  const leaf = parts[parts.length - 1]?.trim() ?? "";
  return leaf.length > 0 ? leaf : id;
}

function classifyFamily(modelName) {
  for (const rule of FAMILY_RULES) {
    if (rule.pattern.test(modelName)) {
      return { family: rule.family, provider: rule.provider };
    }
  }
  return { family: "custom", provider: "custom" };
}

function classifyCapabilities(modelName) {
  const capabilities = [];
  if (/\b(?:mini|fast|flash|lite|nano)\b/i.test(modelName)) capabilities.push("fast");
  if (
    /(?:reasoning|thinking|reasoner|\bpro\b|\bopus\b|^gpt[-_.]?[1-9]|^glm[-_.]?[1-9]|^grok[-_.]?4)/i.test(modelName)
  ) {
    capabilities.push("reasoning");
  }
  if (/(?:vision|visual|vl|multimodal)/i.test(modelName)) capabilities.push("vision");
  if (/(?:image|img|diffusion|sdxl)/i.test(modelName)) capabilities.push("image");
  capabilities.push("general");
  return [...new Set(capabilities)];
}
