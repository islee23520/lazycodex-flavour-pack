#!/usr/bin/env node
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MODEL_FIELDS = new Set(["model", "model_reasoning_effort", "service_tier"]);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_CONFIG = path.join(ROOT, "agent-configs", "omo-agent-model-overrides.toml");

if (isDirectRun()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const configPath = args.config ?? DEFAULT_CONFIG;
    const check = args.check;
    const result = syncAgentOverrides(configPath, { check });
    for (const item of result.changed) {
      console.log(`${check ? "would update" : "updated"} ${item}`);
    }
    if (check && result.changed.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export function syncAgentOverrides(configPath, options = {}) {
  const config = readOverrideConfig(configPath);
  const sourceDir = config.source?.agentsDir;
  const overrides = config.overrides ?? {};
  if (typeof sourceDir !== "string") throw new TypeError("source.agentsDir must be a string");

  assertInstalledAgentDir(sourceDir, overrides);

  const changed = [];

  for (const agentName of Object.keys(overrides)) {
    const sourcePath = path.join(sourceDir, `${agentName}.toml`);
    const currentText = readFileSync(sourcePath, "utf8");
    const nextText = applyModelOverrides(currentText, overrides[agentName] ?? {});
    if (currentText === nextText) continue;
    changed.push(sourcePath);
    if (!options.check) writeFileSync(sourcePath, nextText);
  }

  return { changed };
}

export function readOverrideConfig(configPath) {
  const text = readOverrideConfigText(configPath);
  if (configPath.endsWith(".json")) return JSON.parse(text);
  if (configPath.endsWith(".toml")) return parseOverrideToml(text);
  throw new TypeError(`Unsupported override config format: ${configPath}`);
}

function readOverrideConfigText(configPath) {
  try {
    return readFileSync(configPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Override config does not exist: ${configPath}`);
    }
    throw error;
  }
}

export function applyModelOverrides(sourceText, values) {
  const lines = sourceText.split(/\r?\n/);
  const seen = new Set();
  const output = [];
  let insertAt = 1;

  for (const [index, line] of lines.entries()) {
    const key = line.includes("=") ? line.split("=", 1)[0].trim() : "";
    if (MODEL_FIELDS.has(key) && Object.hasOwn(values, key)) {
      output.push(`${key} = ${JSON.stringify(String(values[key]))}`);
      seen.add(key);
      continue;
    }

    output.push(line);
    if (index < 8 && (line.startsWith("nickname_candidates") || line.startsWith("description"))) {
      insertAt = output.length;
    }
  }

  for (const key of [...MODEL_FIELDS].reverse()) {
    if (Object.hasOwn(values, key) && !seen.has(key)) {
      output.splice(insertAt, 0, `${key} = ${JSON.stringify(String(values[key]))}`);
    }
  }

  return `${output.join("\n").replace(/\n*$/, "")}\n`;
}

function parseArgs(argv) {
  const parsed = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--check") {
      parsed.check = true;
      continue;
    }
    if (item === "--config") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--config requires a value");
      parsed.config = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${item}`);
  }
  return parsed;
}

function parseOverrideToml(text) {
  const config = { source: {}, overrides: {} };
  let section = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (section.startsWith("agents.")) {
        const agentName = section.slice("agents.".length);
        config.overrides[agentName] ??= {};
      }
      continue;
    }

    const assignmentMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"$/);
    if (!assignmentMatch || section === null) continue;

    const [, key, value] = assignmentMatch;
    if (section === "source" && key === "agents_dir") {
      config.source.agentsDir = value;
      continue;
    }

    if (section.startsWith("agents.") && MODEL_FIELDS.has(key)) {
      const agentName = section.slice("agents.".length);
      config.overrides[agentName][key] = value;
    }
  }

  return config;
}

function assertInstalledAgentDir(sourceDir, overrides) {
  try {
    const stats = statSync(sourceDir);
    if (!stats.isDirectory()) {
      throw new Error(
        `Configured LazyCodex/OMO agents_dir is not a directory: ${sourceDir}. Install or update LazyCodex.ai/OMO first, then re-run sync.`
      );
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `Configured LazyCodex/OMO agents_dir does not exist: ${sourceDir}. LazyCodex/OMO is not installed or the configured agents_dir is stale. Install or update LazyCodex.ai/OMO first, then re-run sync.`
      );
    }
    if (error instanceof Error && error.message.startsWith("Configured LazyCodex/OMO agents_dir")) {
      throw error;
    }
    throw error;
  }

  const missing = [];
  for (const agentName of Object.keys(overrides)) {
    const agentPath = path.join(sourceDir, `${agentName}.toml`);
    try {
      const stats = statSync(agentPath);
      if (!stats.isFile()) missing.push(agentPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        missing.push(agentPath);
        continue;
      }
      throw error;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Configured LazyCodex/OMO install appears incomplete or stale. Missing required agent TOML files: ${missing.join(", ")}. Install or update LazyCodex.ai/OMO first, then re-run sync.`
    );
  }
}

function isDirectRun() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
