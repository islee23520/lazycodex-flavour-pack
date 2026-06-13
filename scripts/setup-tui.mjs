import * as clack from "@clack/prompts";
import pc from "picocolors";

import { SERVICE_TIERS, REASONING_EFFORTS } from "./model-config-prompts.mjs";

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
      "Apply only LFP-owned agents, hooks, provider consent, and model-field overrides."
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
  } catch (error) {
    throw error;
  } finally {
    restoreConsole();
  }

  if (capturedOutput.length > 0) prompts.note(capturedOutput.join("\n"), "Setup results");
  prompts.outro(colors.green(`Enabled ${PLUGIN_REF}. Run lfp doctor to verify anytime.`));
}

function createModelSelector(prompts) {
  return async ({ agentName, displayName, current, choices }) => {
    const options = buildModelOptions(current, choices);
    const label = displayName ?? agentName;
    const selected = await prompts.select({
      message: `${label ? `${label} model` : "Model"}`,
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

function buildModelOptions(current, choices) {
  const options = choices.map((choice) => ({
    value: choice.value,
    label: choice.label,
    hint: choice.aliases.includes(current) || choice.key === current ? "current" : undefined
  }));
  if (options.some((option) => option.value === current)) return options;
  return [{ value: current, label: current, hint: "current custom id" }, ...options];
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
    // Clean the typical " [y/N]: " suffix for a nice Clack confirm message
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
  return async ({ agentName, displayName, current }) => {
    const options = SERVICE_TIERS.map((tier) => ({
      value: tier.value,
      label: tier.label,
      hint: tier.value === current ? "current" : undefined
    }));
    const label = displayName ?? agentName;
    const selected = await prompts.select({
      message: `${label ? `${label} service tier` : "Service tier"}`,
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
  return async ({ agentName, displayName, current }) => {
    const options = REASONING_EFFORTS.map((effort) => ({
      value: effort,
      label: effort,
      hint: effort === current ? "current" : undefined
    }));
    const label = displayName ?? agentName;
    const selected = await prompts.select({
      message: `${label ? `${label} reasoning effort` : "Reasoning effort"}`,
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
