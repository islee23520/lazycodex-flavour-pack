import * as clack from "@clack/prompts";
import pc from "picocolors";

import { SERVICE_TIERS, REASONING_EFFORTS } from "./model-config-prompts.mjs";
import { getModelSettingScope } from "./model-setting-scopes.mjs";
import { formatPrimaryFields, getModelSetupGuide } from "./model-setup-guidance.mjs";

import { PLUGIN_REF } from "./codex-plugin-install.mjs";
import { createProviderConsentSelector } from "./setup-provider-tui.mjs";

export function shouldUseSetupTui(args, options) {
  if (options.check || args.noTui === true) return false;
  return options.input?.isTTY === true && options.output?.isTTY === true;
}

export async function runSetupTui(args, context, deps = {}) {
  const prompts = deps.prompts ?? clack;
  const colors = deps.colors ?? pc;
  const runLineSetup = deps.runLineSetup;
  if (runLineSetup === undefined) throw new Error("runSetupTui requires runLineSetup");

  prompts.intro(colors.inverse(" LFP setup "));
  prompts.note(
    [
      `Install and enable ${PLUGIN_REF}.`,
      "Run LazyCodex install first unless explicitly skipped.",
      "Apply only LFP-owned agents, provider consent, and model-field overrides."
    ].join("\n"),
    "LazyCodex overlay"
  );

  const proceed = await prompts.confirm({
    message: "Continue with LFP setup?",
    initialValue: true
  });
  if (prompts.isCancel(proceed) || proceed !== true) {
    prompts.cancel("LFP setup cancelled.");
    throw new Error("LFP setup cancelled");
  }

  const capturedOutput = [];
  const restoreConsole = captureConsoleOutput(capturedOutput);
  try {
    await runLineSetup({ ...args, noTui: true }, context, {
      modelSelector: createModelSelector(prompts),
      tierSelector: createTierSelector(prompts),
      reasoningSelector: createReasoningSelector(prompts),
      yesNoSelector: createYesNoSelector(prompts),
      gitHubStartSelector: createGitHubStartSelector(prompts),
      providerConsentSelector: createProviderConsentSelector(prompts)
    });
  } finally {
    restoreConsole();
  }

  if (capturedOutput.length > 0) prompts.note(capturedOutput.join("\n"), "Setup results");
  prompts.outro(colors.green(`Enabled ${PLUGIN_REF}. Run lfp doctor to verify anytime.`));
}

function createModelSelector(prompts) {
  return async ({ agentName, displayName, current, vanillaRecommendation, vanillaRecommendationFields, recommendationFields, scope, choices }) => {
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
      initialValue: options.find((option) => option.value === current)?.value ?? options[0]?.value
    });
    if (prompts.isCancel(selected)) {
      prompts.cancel("LFP setup cancelled.");
      throw new Error("LFP setup cancelled");
    }
    return selected;
  };
}

function buildModelOptions(current, vanillaRecommendation, choices) {
  const options = choices.map((choice) => ({
    value: choice.value,
    label: choice.label,
    hint: getModelOptionHint(choice, current, vanillaRecommendation)
  }));
  if (options.some((option) => option.value === current)) return options;
  const hint = current === vanillaRecommendation ? "current custom id, vanilla LazyCodex" : "current custom id";
  return [{ value: current, label: current, hint }, ...options];
}

function getModelOptionHint(choice, current, vanillaRecommendation) {
  const isCurrent = choice.aliases.includes(current) || choice.key === current;
  const isVanilla = choice.aliases.includes(vanillaRecommendation) || choice.key === vanillaRecommendation;
  if (isCurrent && isVanilla) return "current, vanilla LazyCodex";
  if (isCurrent) return "current";
  if (isVanilla) return "vanilla LazyCodex";
  return undefined;
}

function buildModelGuideNote({ label, agentName, fieldName, currentFields, vanillaFields, recommendationFields, scope }) {
  const guide = getModelSetupGuide(agentName);
  const lines = [];
  if (scope?.line) lines.push(`Affects: ${scope.line}`);
  lines.push(`Role guide: ${guide.role}`);
  lines.push(`Tune for: ${guide.tuneFor}`);
  lines.push(`Minimum capability: ${guide.minimum}`);
  lines.push(`Current/default: ${formatPrimaryFields(currentFields)}`);
  if (vanillaFields !== null && vanillaFields !== undefined) {
    lines.push(`Vanilla LazyCodex recommendation: ${formatPrimaryFields(vanillaFields)}`);
  }
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

function captureConsoleOutput(lines) {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values) => lines.push(values.map(String).join(" "));
  console.error = (...values) => lines.push(values.map(String).join(" "));
  return () => {
    console.log = originalLog;
    console.error = originalError;
  };
}

function createYesNoSelector(prompts) {
  return async ({ question }) => {
    const cleanMessage = String(question || "").replace(/\s*\[y\/N\]\s*:?\s*$/i, "").trim();
    const answer = await prompts.confirm({
      message: cleanMessage || question,
      initialValue: false
    });
    if (prompts.isCancel(answer)) {
      prompts.cancel("LFP setup cancelled.");
      throw new Error("LFP setup cancelled");
    }
    return !!answer;
  };
}

function createTierSelector(prompts) {
  return async ({ agentName, displayName, current, vanillaRecommendation, vanillaRecommendationFields, recommendationFields }) => {
    const options = SERVICE_TIERS.map((tier) => ({
      value: tier.value,
      label: tier.label,
      hint: getFieldOptionHint(tier.value, current, vanillaRecommendation)
    }));
    const label = displayName ?? agentName;
    const scope = getModelSettingScope(agentName);
    const note = buildModelGuideNote({
      label,
      agentName,
      fieldName: "service tier",
      currentFields: { service_tier: current },
      vanillaFields: vanillaRecommendationFields ?? (vanillaRecommendation === undefined ? null : { service_tier: vanillaRecommendation }),
      recommendationFields,
      scope
    });
    prompts.note(note.message, note.title);
    const selected = await prompts.select({
      message: formatFieldSelectorMessage(label, "service tier", vanillaRecommendation),
      options,
      initialValue: current
    });
    if (prompts.isCancel(selected)) {
      prompts.cancel("LFP setup cancelled.");
      throw new Error("LFP setup cancelled");
    }
    return selected;
  };
}

function createReasoningSelector(prompts) {
  return async ({ agentName, displayName, current, vanillaRecommendation, vanillaRecommendationFields, recommendationFields }) => {
    const options = REASONING_EFFORTS.map((effort) => ({
      value: effort,
      label: effort,
      hint: getFieldOptionHint(effort, current, vanillaRecommendation)
    }));
    const label = displayName ?? agentName;
    const scope = getModelSettingScope(agentName);
    const note = buildModelGuideNote({
      label,
      agentName,
      fieldName: "reasoning effort",
      currentFields: { model_reasoning_effort: current },
      vanillaFields: vanillaRecommendationFields ?? (vanillaRecommendation === undefined ? null : { model_reasoning_effort: vanillaRecommendation }),
      recommendationFields,
      scope
    });
    prompts.note(note.message, note.title);
    const selected = await prompts.select({
      message: formatFieldSelectorMessage(label, "reasoning effort", vanillaRecommendation),
      options,
      initialValue: current
    });
    if (prompts.isCancel(selected)) {
      prompts.cancel("LFP setup cancelled.");
      throw new Error("LFP setup cancelled");
    }
    return selected;
  };
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

function createGitHubStartSelector(prompts) {
  return async () => {
    const targets = [
      { id: "lazycodex-ai", label: "LazyCodex AI", repo: "sisyphuslabs/lazycodex-ai", url: "https://github.com/sisyphuslabs/lazycodex-ai" },
      { id: "omo", label: "OMO", repo: "sisyphuslabs/omo", url: "https://github.com/sisyphuslabs/omo" },
      { id: "lfp", label: "LFP", repo: "islee23520/lazycodex-flavour-pack", url: "https://github.com/islee23520/lazycodex-flavour-pack" }
    ];

    const options = [
      ...targets.map((t, i) => ({
        value: String(i + 1),
        label: `${t.label} (${t.repo})`
      })),
      { value: "skip", label: "Skip (do not open)" }
    ];

    const selected = await prompts.select({
      message: "Start GitHub work from which repo?",
      options,
      initialValue: "skip"
    });
    if (prompts.isCancel(selected)) {
      prompts.cancel("LFP setup cancelled.");
      throw new Error("LFP setup cancelled");
    }
    if (selected === "skip") return null;
    return targets[Number(selected) - 1] ?? null;
  };
}
