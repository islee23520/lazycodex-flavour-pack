import { BACK_SELECTION, REASONING_EFFORTS, SERVICE_TIERS } from "../model/model-config-prompts.js";
import { getModelSettingScope } from "../model/model-setting-scopes.js";
import { formatPrimaryFields, getModelSetupGuide } from "../model/model-setup-guidance.js";

export function createModelSelector(prompts) {
  return async ({
    agentName,
    displayName,
    current,
    vanillaRecommendation,
    vanillaRecommendationFields,
    recommendationFields,
    scope,
    choices
  }) => {
    const options = buildModelOptions(current, vanillaRecommendation, choices);
    const label = displayName ?? agentName;
    const settingScope = scope ?? getModelSettingScope(agentName);
    const note = buildModelGuideNote({
      label,
      agentName,
      fieldName: "model",
      currentFields: { model: current },
      vanillaFields: vanillaRecommendationFields ?? asModelFields(vanillaRecommendation),
      recommendationFields,
      scope: settingScope
    });
    prompts.note(note.message, note.title);
    const selected = await prompts.select({
      message: formatModelSelectorMessage(label, settingScope),
      options,
      initialValue: selectableInitialValue(options, current)
    });
    return cancelOrValue(prompts, selected);
  };
}

export function createYesNoSelector(prompts) {
  return async ({ question }) => {
    const cleanMessage = String(question || "")
      .replace(/\s*\[y\/N\]\s*:?\s*$/i, "")
      .trim();
    const answer = await prompts.select({
      message: cleanMessage || question,
      options: [{ value: true, label: "Yes" }, { value: false, label: "No", hint: "keep current setup" }, backOption()],
      initialValue: false
    });
    return cancelOrValue(prompts, answer);
  };
}

export function createTierSelector(prompts) {
  return async ({
    agentName,
    displayName,
    current,
    vanillaRecommendation,
    vanillaRecommendationFields,
    recommendationFields
  }) => {
    const options = [
      ...SERVICE_TIERS.map((tier) => ({
        value: tier.value,
        label: formatPinnedValueLabel(tier.label, {
          current: tier.value === current,
          vanilla: tier.value === vanillaRecommendation
        }),
        hint: getFieldOptionHint(tier.value, current, vanillaRecommendation)
      })),
      backOption()
    ];
    const label = displayName ?? agentName;
    const scope = getModelSettingScope(agentName);
    const note = buildModelGuideNote({
      label,
      agentName,
      fieldName: "service tier",
      currentFields: { service_tier: current },
      vanillaFields:
        vanillaRecommendationFields ??
        (vanillaRecommendation === undefined ? null : { service_tier: vanillaRecommendation }),
      recommendationFields,
      scope
    });
    prompts.note(note.message, note.title);
    const selected = await prompts.select({
      message: formatFieldSelectorMessage(label, "service tier", vanillaRecommendation),
      options,
      initialValue: selectableInitialValue(options, current)
    });
    return cancelOrValue(prompts, selected);
  };
}

export function createReasoningSelector(prompts) {
  return async ({
    agentName,
    displayName,
    current,
    vanillaRecommendation,
    vanillaRecommendationFields,
    recommendationFields
  }) => {
    const options = [
      ...REASONING_EFFORTS.map((effort) => ({
        value: effort,
        label: formatPinnedValueLabel(effort, {
          current: effort === current,
          vanilla: effort === vanillaRecommendation
        }),
        hint: getFieldOptionHint(effort, current, vanillaRecommendation)
      })),
      backOption()
    ];
    const label = displayName ?? agentName;
    const scope = getModelSettingScope(agentName);
    const note = buildModelGuideNote({
      label,
      agentName,
      fieldName: "reasoning effort",
      currentFields: { model_reasoning_effort: current },
      vanillaFields:
        vanillaRecommendationFields ??
        (vanillaRecommendation === undefined ? null : { model_reasoning_effort: vanillaRecommendation }),
      recommendationFields,
      scope
    });
    prompts.note(note.message, note.title);
    const selected = await prompts.select({
      message: formatFieldSelectorMessage(label, "reasoning effort", vanillaRecommendation),
      options,
      initialValue: selectableInitialValue(options, current)
    });
    return cancelOrValue(prompts, selected);
  };
}

export function createGitHubStartSelector(prompts) {
  return async () => {
    const targets = [
      {
        id: "lazycodex-ai",
        label: "LazyCodex AI",
        repo: "sisyphuslabs/lazycodex-ai",
        url: "https://github.com/sisyphuslabs/lazycodex-ai"
      },
      { id: "omo", label: "OMO", repo: "sisyphuslabs/omo", url: "https://github.com/sisyphuslabs/omo" },
      {
        id: "lfp",
        label: "LFP",
        repo: "islee23520/lazycodex-flavour-pack",
        url: "https://github.com/islee23520/lazycodex-flavour-pack"
      }
    ];

    const options = [
      ...targets.map((target, index) => ({
        value: String(index + 1),
        label: `${target.label} (${target.repo})`
      })),
      { value: "skip", label: "Skip (do not open)" }
    ];

    const selected = await prompts.select({
      message: "Start GitHub work from which repo?",
      options,
      initialValue: "skip"
    });
    const value = cancelOrValue(prompts, selected);
    if (value === "skip") return null;
    return targets[Number(value) - 1] ?? null;
  };
}

function buildModelOptions(current, vanillaRecommendation, choices) {
  const options = choices.map((choice) => ({
    value: choice.value,
    label: formatModelOptionLabel(choice, current, vanillaRecommendation),
    hint: getModelOptionHint(choice, current, vanillaRecommendation)
  }));
  const withCurrent = options.some((option) => option.value === current)
    ? options
    : [
        {
          value: current,
          label: formatPinnedValueLabel(current, { current: true, vanilla: current === vanillaRecommendation }),
          hint: current === vanillaRecommendation ? "custom id, vanilla LazyCodex" : "custom id"
        },
        ...options
      ];
  return [...withCurrent, backOption()];
}

function formatModelOptionLabel(choice, current, vanillaRecommendation) {
  const isCurrent = choice.aliases.includes(current) || choice.key === current;
  const isVanilla = choice.aliases.includes(vanillaRecommendation) || choice.key === vanillaRecommendation;
  return formatPinnedValueLabel(choice.label, { current: isCurrent, vanilla: isVanilla });
}

function formatPinnedValueLabel(label, { current, vanilla }) {
  const markers = [];
  if (current) markers.push("current");
  if (vanilla) markers.push("vanilla LazyCodex default");
  return markers.length > 0 ? `${label} (${markers.join("; ")})` : label;
}

function backOption() {
  return { value: BACK_SELECTION, label: "Back to previous setting", hint: "return without saving this field" };
}

function selectableInitialValue(options, current) {
  return (
    options.find((option) => option.value === current && option.value !== BACK_SELECTION)?.value ??
    options.find((option) => option.value !== BACK_SELECTION)?.value
  );
}

function getModelOptionHint(choice, current, vanillaRecommendation) {
  const isCurrent = choice.aliases.includes(current) || choice.key === current;
  const isVanilla = choice.aliases.includes(vanillaRecommendation) || choice.key === vanillaRecommendation;
  if (isCurrent && isVanilla) return "current, vanilla LazyCodex";
  if (isCurrent) return "current";
  if (isVanilla) return "vanilla LazyCodex";
  return undefined;
}

function buildModelGuideNote({
  label,
  agentName,
  fieldName,
  currentFields,
  vanillaFields,
  recommendationFields,
  scope
}) {
  const guide = getModelSetupGuide(agentName);
  const lines = [];
  if (scope?.line) lines.push(`Affects: ${scope.line}`);
  lines.push(`Role guide: ${guide.role}`);
  lines.push(`Tune for: ${guide.tuneFor}`);
  lines.push(`Minimum capability: ${guide.minimum}`);
  lines.push(`Current/default: ${formatPrimaryFields(currentFields)}`);
  if (vanillaFields !== null && vanillaFields !== undefined) {
    lines.push(`Vanilla LazyCodex recommendation: ${formatPrimaryFields(vanillaFields)}`);
    lines.push("Choose the option marked vanilla LazyCodex default to restore the upstream value for this field.");
  }
  lines.push("Back: choose Back to previous setting to revisit the last prompt.");
  if (hasRecommendedFields(recommendationFields)) {
    lines.push(`LFP recommendation: ${formatPrimaryFields(recommendationFields)}`);
  }
  return { title: `${label ?? "Model"} ${fieldName} guide`, message: lines.join("\n") };
}

function asModelFields(model) {
  if (model === undefined) return null;
  return { model };
}

function formatModelSelectorMessage(label, scope) {
  const prefix = label ? `${label} model` : "Model";
  return scope?.tui ? `${prefix} (affects ${scope.tui})` : prefix;
}

function getFieldOptionHint(value, current, vanillaRecommendation) {
  const isCurrent = value === current;
  const isVanilla = value === vanillaRecommendation;
  if (isCurrent && isVanilla) return "current, vanilla LazyCodex";
  if (isCurrent) return "current";
  if (isVanilla) return "vanilla LazyCodex";
  return undefined;
}

function formatFieldSelectorMessage(label, fieldName, vanillaRecommendation) {
  const prefix = label ? `${label} ${fieldName}` : fieldName;
  if (vanillaRecommendation === undefined) return prefix;
  return `${prefix} (vanilla LazyCodex: ${vanillaRecommendation})`;
}

function hasRecommendedFields(fields) {
  return Boolean(fields?.model || fields?.model_reasoning_effort || fields?.service_tier);
}

function cancelOrValue(prompts, value) {
  if (prompts.isCancel(value)) {
    prompts.cancel("LFP setup cancelled.");
    throw new Error("LFP setup cancelled");
  }
  return value;
}
