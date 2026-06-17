import { getModelSettingScope } from "./model-setting-scopes.mjs";

export const SERVICE_TIERS = [
  { value: "default", label: "default (non-fast)" },
  { value: "fast", label: "fast" }
];

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"];

export function logAgentGuide(output, agentName, current, options = {}) {
  if (agentName) output?.log?.(`Agent: ${agentName}`);
  output?.log?.(`  Current: ${current.model ?? "unknown"} (reasoning: ${current.reasoning ?? "unset"}, tier: ${current.tier ?? "unset"})`);
  if (options.preferCurrent === true) {
    output?.log?.("  Default: keep the current LazyCodex/OMO value; press Enter to leave it unchanged.");
    return;
  }
  output?.log?.("  Guide: no preset — choose a model from the available list or type a custom id.");
}

export async function promptForModel(rl, { agentName, displayName, current, vanillaRecommendation, vanillaRecommendationFields, models, output, modelSelector }) {
  const choices = groupModelAliases(models);
  const defaultIndex = choices.findIndex((choice) => choice.aliases.includes(current) || choice.key === current) + 1;
  const suffix = defaultIndex > 0 ? `[${defaultIndex}]` : `[${current}]`;
  const label = displayName ?? agentName;
  const prefix = label ? `${label} model` : "Model";
  const scope = getModelSettingScope(agentName);

  if (typeof modelSelector === "function") {
    return await modelSelector({
      agentName,
      displayName: label,
      current,
      vanillaRecommendation,
      vanillaRecommendationFields,
      scope,
      choices: choices.map((choice) => ({ ...choice, label: formatModelChoice(choice) }))
    });
  }

  while (true) {
    const answer = (await prompt(rl, `  ${prefix} ${suffix}: `)).trim();
    if (answer.length === 0) return current;

    const selected = parseModelSelection(answer, choices);
    if (selected !== null) return selected;

    output?.log?.("  Choose a listed number or model id.");
  }
}

export async function promptForServiceTier(rl, { agentName, displayName, current, vanillaRecommendation, output, tierSelector }) {
  if (typeof tierSelector === "function") {
    return await tierSelector({ agentName, displayName: displayName ?? agentName, current, vanillaRecommendation });
  }

  if (vanillaRecommendation !== undefined) output?.log?.(`  Vanilla LazyCodex service tier: ${vanillaRecommendation}`);
  printChoices(SERVICE_TIERS.map((tier) => formatChoiceWithVanilla(tier.label, tier.value, vanillaRecommendation)), output);
  const defaultIndex = SERVICE_TIERS.findIndex((tier) => tier.value === current) + 1;
  const suffix = defaultIndex > 0 ? `[${defaultIndex}]` : `[${current}]`;
  const label = displayName ?? agentName;
  const prefix = label ? `${label} service tier` : "Service tier";

  while (true) {
    const answer = (await prompt(rl, `  ${prefix} ${suffix}: `)).trim();
    if (answer.length === 0) return current;

    const selected = parseListedSelection(
      answer,
      SERVICE_TIERS.map((tier) => tier.value)
    );
    if (selected !== null) return selected;

    output?.log?.("  Choose 1 for default/non-fast or 2 for fast.");
  }
}

export async function promptForReasoningEffort(rl, { agentName, displayName, current, vanillaRecommendation, output, reasoningSelector }) {
  if (typeof reasoningSelector === "function") {
    return await reasoningSelector({ agentName, displayName: displayName ?? agentName, current, vanillaRecommendation });
  }

  if (vanillaRecommendation !== undefined) output?.log?.(`  Vanilla LazyCodex reasoning effort: ${vanillaRecommendation}`);
  printChoices(REASONING_EFFORTS.map((effort) => formatChoiceWithVanilla(effort, effort, vanillaRecommendation)), output);
  const defaultIndex = REASONING_EFFORTS.indexOf(current) + 1;
  const suffix = defaultIndex > 0 ? `[${defaultIndex}]` : `[${current}]`;
  const label = displayName ?? agentName;
  const prefix = label ? `${label} reasoning effort` : "Reasoning effort";

  while (true) {
    const answer = (await prompt(rl, `  ${prefix} ${suffix}: `)).trim();
    if (answer.length === 0) return current;

    const selected = parseListedSelection(answer, REASONING_EFFORTS);
    if (selected !== null) return selected;

    output?.log?.("  Choose a listed reasoning effort.");
  }
}

export function printModelChoices(models, output) {
  output?.log?.("Available models (enter number or exact model id):");
  for (const [index, choice] of groupModelAliases(models).entries()) {
    output?.log?.(`  ${index + 1}. ${formatModelChoice(choice)}`);
  }
  output?.log?.("");
}

export async function promptForYesNo(rl, question, options = {}) {
  const { yesNoSelector } = options;
  if (typeof yesNoSelector === "function") {
    return await yesNoSelector({ question });
  }
  const answer = (await prompt(rl, question)).trim().toLowerCase();
  return ["y", "yes"].includes(answer);
}

export function parseListedSelection(answer, values) {
  if (/^[0-9]+$/.test(answer)) return values[Number(answer) - 1] ?? null;
  return values.includes(answer) ? answer : null;
}

export function groupModelAliases(models) {
  const groups = new Map();
  for (const model of models) {
    const key = canonicalModelName(model);
    const aliases = groups.get(key) ?? [];
    aliases.push(model);
    groups.set(key, aliases);
  }

  return [...groups.entries()]
    .map(([key, aliases]) => {
      const uniqueAliases = [...new Set(aliases)].sort((a, b) => a.localeCompare(b));
      return { key, aliases: uniqueAliases, value: chooseRepresentative(key, uniqueAliases) };
    });
}

function parseModelSelection(answer, choices) {
  if (/^[0-9]+$/.test(answer)) return choices[Number(answer) - 1]?.value ?? null;
  for (const choice of choices) {
    if (choice.aliases.includes(answer)) return answer;
    if (choice.key === answer) return answer;
  }
  return answer;
}

function formatModelChoice(choice) {
  if (choice.aliases.length === 1) return choice.aliases[0];
  return `${choice.key} (aliases: ${choice.aliases.join(", ")})`;
}

function canonicalModelName(model) {
  return model.split("/").at(-1) ?? model;
}

function chooseRepresentative(key, aliases) {
  return aliases.find((alias) => alias === key) ?? aliases.find((alias) => alias === `openai/${key}`) ?? aliases[0];
}

function printChoices(values, output) {
  for (const [index, value] of values.entries()) output?.log?.(`  ${index + 1}. ${value}`);
}

function formatChoiceWithVanilla(label, value, vanillaRecommendation) {
  return value === vanillaRecommendation ? `${label} (vanilla LazyCodex)` : label;
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}
