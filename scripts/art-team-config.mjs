#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fetchAvailableModels } from "./agent-model-config.mjs";
import {
  logAgentGuide,
  printModelChoices,
  promptForModel,
  promptForReasoningEffort,
  promptForServiceTier
} from "./model-config-prompts.mjs";

const ART_AGENTS = [
  {
    name: "artistry",
    label: "Art Director (supervisor)",
    defaultModel: "gemini-pro-agent",
    defaultReasoning: "high",
    defaultServiceTier: "default",
    description: "Sets creative direction, writes art briefs, manages the production loop. Called 2-3 times total."
  },
  {
    name: "artistry-gen",
    label: "Production Worker (loop)",
    defaultModel: "gemini-pro-agent",
    defaultReasoning: "low",
    defaultServiceTier: "default",
    description: "Computer Use worker that operates the creative tool. Runs the inner loop (many calls, must be cheap)."
  },
  {
    name: "artistry-qa",
    label: "Visual QA Inspector",
    defaultModel: "gemini-pro-agent",
    defaultReasoning: "high",
    defaultServiceTier: "default",
    description: "Inspects screenshots against art brief criteria. Called at each checkpoint."
  }
];

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ART_AGENT_CONFIGS_DIR = path.join(ROOT, "agent-configs");

if (isDirectRun()) {
  configureArtTeam();
}

export async function configureArtTeamIfWanted(options = {}) {
  const rl = options.readline ?? createReadline();
  const output = options.output ?? console;

  try {
    const answer = (await prompt(rl, "Configure art team models now? [y/N]: ")).trim().toLowerCase();
    if (!["y", "yes"].includes(answer)) {
      output.log("Keeping existing art team model configuration.");
      return null;
    }

    return await configureArtTeam({ ...options, readline: rl, output });
  } finally {
    if (!options.readline) rl.close();
  }
}

export async function configureArtTeam(options = {}) {
  const output = options.output ?? console;
  const configDir = options.configDir ?? ART_AGENT_CONFIGS_DIR;
  const config = options.config ?? readCurrentConfig({ configDir });
  const rl = options.readline ?? createReadline();
  const models = options.models ?? (await safeFetchAvailableModels({ ...options, output }));

  try {
    output.log("\n=== Art Team Model Configuration ===");
    output.log("Choose models, reasoning effort, and fast/non-fast tiers for each art team agent.\n");
    if (models.length > 0) printModelChoices(models, output);

    for (const agent of ART_AGENTS) {
      const current = config[agent.name] ?? { model: agent.defaultModel };

      output.log(`${agent.label}`);
      output.log(`  Role: ${agent.description}`);
      output.log(`  Default: ${agent.defaultModel}`);
      logAgentGuide(output, agent.name, {
        model: current.model,
        reasoning: current.model_reasoning_effort ?? agent.defaultReasoning,
        tier: current.service_tier ?? agent.defaultServiceTier
      });

      const model =
        models.length > 0
          ? await promptForModel(rl, { current: current.model, models, output })
          : await promptForText(rl, `  Model [${current.model}]: `, current.model);
      const tier = await promptForServiceTier(rl, {
        current: current.service_tier ?? agent.defaultServiceTier,
        output
      });
      const reasoning = await promptForReasoningEffort(rl, {
        current: current.model_reasoning_effort ?? agent.defaultReasoning,
        output
      });

      config[agent.name] = {
        model,
        model_reasoning_effort: reasoning,
        service_tier: tier
      };

      output.log(`  -> ${model} (reasoning: ${config[agent.name].model_reasoning_effort}, tier: ${tier})\n`);
    }
  } finally {
    if (!options.readline) rl.close();
  }

  writeArtTeamConfigs(config, { configDir });
  output.log("Art team configuration written to agent-configs/.\n");
  return config;
}

export function readCurrentConfig(options = {}) {
  const configDir = options.configDir ?? ART_AGENT_CONFIGS_DIR;
  const config = {};
  for (const agent of ART_AGENTS) {
    const tomlPath = path.join(configDir, `${agent.name}.toml`);
    try {
      const text = readFileSync(tomlPath, "utf8");
      config[agent.name] = {
        model: readTomlField(text, "model") ?? agent.defaultModel,
        model_reasoning_effort: readTomlField(text, "model_reasoning_effort") ?? agent.defaultReasoning,
        service_tier: readTomlField(text, "service_tier") ?? agent.defaultServiceTier
      };
    } catch {
      config[agent.name] = {
        model: agent.defaultModel,
        model_reasoning_effort: agent.defaultReasoning,
        service_tier: agent.defaultServiceTier
      };
    }
  }
  return config;
}

export function writeArtTeamConfigs(config, options = {}) {
  const configDir = options.configDir ?? ART_AGENT_CONFIGS_DIR;
  for (const agent of ART_AGENTS) {
    const tomlPath = path.join(configDir, `${agent.name}.toml`);
    const text = readFileSync(tomlPath, "utf8");
    const updated = applyModelFields(text, config[agent.name]);
    writeFileSync(tomlPath, updated);
  }
}

export function getArtTeamModelDefaults() {
  const config = {};
  for (const agent of ART_AGENTS) {
    config[agent.name] = { model: agent.defaultModel };
  }
  return config;
}

export const ART_AGENT_FILE_NAMES = ART_AGENTS.map((a) => `${a.name}.toml`);

function applyModelFields(text, values) {
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  const output = [];
  let insertAt = 1;

  const fields = new Set(["model", "model_reasoning_effort", "service_tier"]);

  for (const [index, line] of lines.entries()) {
    const key = line.includes("=") ? line.split("=", 1)[0].trim() : "";
    if (fields.has(key) && Object.hasOwn(values, key)) {
      output.push(`${key} = ${JSON.stringify(String(values[key]))}`);
      seen.add(key);
      continue;
    }

    output.push(line);
    if (index < 8 && (line.startsWith("nickname_candidates") || line.startsWith("description"))) {
      insertAt = output.length;
    }
  }

  for (const key of [...fields].reverse()) {
    if (Object.hasOwn(values, key) && !seen.has(key)) {
      output.splice(insertAt, 0, `${key} = ${JSON.stringify(String(values[key]))}`);
    }
  }

  return `${output.join("\n").replace(/\n*$/, "")}\n`;
}

function readTomlField(text, key) {
  const match = new RegExp(`^${key}\\s*=\\s*"([^"]*)"\\s*$`, "m").exec(text);
  return match?.[1] ?? null;
}

async function safeFetchAvailableModels(options) {
  try {
    return await fetchAvailableModels(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.output?.log?.(`Could not discover available models: ${message}`);
    return [];
  }
}

async function promptForText(rl, question, defaultValue) {
  const answer = (await prompt(rl, question)).trim();
  return answer || defaultValue;
}

function createReadline() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function isDirectRun() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
