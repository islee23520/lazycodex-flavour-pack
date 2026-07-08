import { resolveCategory, resolveCategoryForPrompt } from "../model/category-resolver.js";

const GUIDANCE_MARKER = "<lfp-category-routing-guidance>";

export function runCategoryGuidance(input = {}) {
  const text = (input.prompt || input.message || input.transcript || "").toString();
  if (!text) return { emit: false, reason: "no-text" };
  if (text.includes(GUIDANCE_MARKER)) return { emit: false, reason: "already-present" };

  const categoryName = resolveCategoryForPrompt(text);
  if (!categoryName) return { emit: false, reason: "no-match" };

  const category = resolveCategory(categoryName);
  if (!category) return { emit: false, reason: "category-not-found" };

  const guidance = `<lfp-category-routing-guidance>
Detected work category: ${categoryName}. Recommended model routing: model=${category.model}, reasoning=${category.model_reasoning_effort}, tier=${category.service_tier}. Fallback chain: ${category.fallback_models.join(", ")}. Adjust your approach to match this category's model profile.
</lfp-category-routing-guidance>`;

  return {
    emit: true,
    guidance,
    marker: GUIDANCE_MARKER,
    category: categoryName
  };
}
