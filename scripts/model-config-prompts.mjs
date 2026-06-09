export const SERVICE_TIERS = [
  { value: "default", label: "default (non-fast)" },
  { value: "fast", label: "fast" }
];

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

const GUIDE_BY_AGENT = {
  artistry: { model: "google/gemini-3.1-pro", reasoning: "high", note: "creative direction" },
  "artistry-gen": { model: "glm-5v-turbo", reasoning: "medium", service_tier: "fast", note: "cheap inner loop" },
  "artistry-qa": { model: "grok-4.3", reasoning: "high", note: "visual QA checkpoints" },
  "codex-ultrawork-reviewer": { model: "gpt-5.5", reasoning: "high", note: "reviewer/QA execution" },
  deep: { model: "gpt-5.5", reasoning: "medium", note: "deep coding" },
  explore: { model: "gpt-5.4-mini-fast", reasoning: "low", service_tier: "fast", note: "fast exploration" },
  explorer: { model: "gpt-5.4-mini-fast", reasoning: "low", service_tier: "fast", note: "fast exploration" },
  librarian: { model: "gpt-5.4-mini-fast", reasoning: "low", service_tier: "fast", note: "fast retrieval" },
  metis: { model: "gpt-5.5", reasoning: "high", note: "implementation planning" },
  momus: { model: "gpt-5.5", reasoning: "xhigh", note: "adversarial review" },
  plan: { model: "gpt-5.5", reasoning: "high", note: "Prometheus planning" },
  prometheus: { model: "gpt-5.5", reasoning: "high", note: "planning fallback" },
  quick: { model: "gpt-5.4-mini", reasoning: "low", service_tier: "fast", note: "simple fast tasks" },
  ultrabrain: { model: "gpt-5.5", reasoning: "xhigh", note: "maximum reasoning" },
  "unspecified-high": { model: "gpt-5.5", reasoning: "high", note: "complex general work" },
  "unspecified-low": { model: "gpt-5.5-codex", reasoning: "medium", note: "standard general work" }
};

export function getAgentModelGuide(agentName) {
  return GUIDE_BY_AGENT[String(agentName).toLowerCase()] ?? null;
}

export function logAgentGuide(output, agentName, current) {
  const guide = getAgentModelGuide(agentName);
  output?.log?.(`  Current: ${current.model ?? "unknown"} (reasoning: ${current.reasoning ?? "unset"}, tier: ${current.tier ?? "unset"})`);
  if (guide === null) return;

  const tier = guide.service_tier ? `, tier: ${guide.service_tier}` : "";
  output?.log?.(`  Guide: ${guide.model} (reasoning: ${guide.reasoning}${tier}) - ${guide.note}`);
}

export async function promptForModel(rl, { agentName, current, models, output }) {
  const choices = groupModelAliases(models);
  const defaultIndex = choices.findIndex((choice) => choice.aliases.includes(current) || choice.key === current) + 1;
  const suffix = defaultIndex > 0 ? `[${defaultIndex}]` : `[${current}]`;
  const prefix = agentName ? `${agentName} model` : "Model";

  while (true) {
    const answer = (await prompt(rl, `  ${prefix} ${suffix}: `)).trim();
    if (answer.length === 0) return current;

    const selected = parseModelSelection(answer, choices);
    if (selected !== null) return selected;

    output?.log?.("  Choose a listed number or model id.");
  }
}

export async function promptForServiceTier(rl, { agentName, current, output }) {
  printChoices(SERVICE_TIERS.map((tier) => tier.label), output);
  const defaultIndex = SERVICE_TIERS.findIndex((tier) => tier.value === current) + 1;
  const suffix = defaultIndex > 0 ? `[${defaultIndex}]` : `[${current}]`;
  const prefix = agentName ? `${agentName} service tier` : "Service tier";

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

export async function promptForReasoningEffort(rl, { agentName, current, output }) {
  printChoices(REASONING_EFFORTS, output);
  const defaultIndex = REASONING_EFFORTS.indexOf(current) + 1;
  const suffix = defaultIndex > 0 ? `[${defaultIndex}]` : `[${current}]`;
  const prefix = agentName ? `${agentName} reasoning effort` : "Reasoning effort";

  while (true) {
    const answer = (await prompt(rl, `  ${prefix} ${suffix}: `)).trim();
    if (answer.length === 0) return current;

    const selected = parseListedSelection(answer, REASONING_EFFORTS);
    if (selected !== null) return selected;

    output?.log?.("  Choose a listed reasoning effort.");
  }
}

export function printModelChoices(models, output) {
  for (const [index, choice] of groupModelAliases(models).entries()) {
    output?.log?.(`  ${index + 1}. ${formatModelChoice(choice)}`);
  }
  output?.log?.("");
}

export async function promptForYesNo(rl, question) {
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
    if (choice.key === answer) return choice.value;
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

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}
