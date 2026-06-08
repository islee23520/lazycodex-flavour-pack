#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ART_AGENT_CONFIGS_DIR = path.join(ROOT, "agent-configs");

const ART_AGENTS = [
  {
    name: "artistry",
    label: "Art Director (supervisor)",
    defaultModel: "gpt-5.5",
    defaultReasoning: "high",
    defaultServiceTier: "default",
    description: "Sets creative direction, writes art briefs, manages the production loop. Called 2-3 times total."
  },
  {
    name: "artistry-gen",
    label: "Production Worker (loop)",
    defaultModel: "glm-5v-turbo",
    defaultReasoning: "medium",
    defaultServiceTier: "fast",
    description: "Computer Use worker that operates the creative tool. Runs the inner loop (many calls, must be cheap)."
  },
  {
    name: "artistry-qa",
    label: "Visual QA Inspector",
    defaultModel: "grok-4.3",
    defaultReasoning: "high",
    defaultServiceTier: "default",
    description: "Inspects screenshots against art brief criteria. Called at each checkpoint."
  }
];

if (isDirectRun()) {
  configureArtTeam();
}

export async function configureArtTeam(options = {}) {
  const config = options.config ?? readCurrentConfig();
  const rl = options.readline ?? createReadline();

  try {
    console.log("\n=== Art Team Model Configuration ===");
    console.log("Configure the models for each art team agent.");
    console.log("Press Enter to accept the default, or type a model name.\n");

    for (const agent of ART_AGENTS) {
      const current = config[agent.name] ?? { model: agent.defaultModel };

      console.log(`${agent.label}`);
      console.log(`  Role: ${agent.description}`);
      console.log(`  Default: ${agent.defaultModel}`);

      const modelAnswer = await prompt(rl, `  Model [${current.model}]: `);
      const model = modelAnswer.trim() || current.model;

      const reasoningAnswer = await prompt(rl, `  Reasoning effort [${agent.defaultReasoning}]: `);
      const reasoning = reasoningAnswer.trim() || agent.defaultReasoning;

      const tierAnswer = await prompt(rl, `  Service tier [${agent.defaultServiceTier}]: `);
      const tier = tierAnswer.trim() || agent.defaultServiceTier;

      config[agent.name] = {
        model,
        model_reasoning_effort: reasoning,
        service_tier: tier
      };

      console.log(`  -> ${model} (reasoning: ${reasoning}, tier: ${tier})\n`);
    }
  } finally {
    if (!options.readline) rl.close();
  }

  writeArtTeamConfigs(config);
  console.log("Art team configuration written to agent-configs/.\n");
  return config;
}

export function readCurrentConfig() {
  const config = {};
  for (const agent of ART_AGENTS) {
    const tomlPath = path.join(ART_AGENT_CONFIGS_DIR, `${agent.name}.toml`);
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

export function writeArtTeamConfigs(config) {
  for (const agent of ART_AGENTS) {
    const tomlPath = path.join(ART_AGENT_CONFIGS_DIR, `${agent.name}.toml`);
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

function createReadline() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function isDirectRun() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
