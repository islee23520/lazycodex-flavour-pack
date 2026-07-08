import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

import { escapeRegExp, getTableBlock, readTopLevelTomlString } from "../utils/toml-string-utils.js";

const SISYPHUS_MAIN_MODEL = "zai/glm-5.2[1m]";
const SISYPHUS_MAIN_PROVIDER = "opencodex";
const SISYPHUS_RULE_DESCRIPTION = "OMO Hephaestus baseline discipline for Codex";

export async function maybeConfigureOpenCodexSisyphus(options = {}) {
  const env = options.env ?? process.env;
  const check = options.check === true;
  const codexHome = getCodexHome(env);
  const home = getHome(env);
  const configPath = path.join(codexHome, "config.toml");
  const rulePath = path.join(home, ".opencode", "rules", "hephaestus.md");
  const currentText = readTextIfExists(configPath);

  if (!isOpenCodexActive(currentText)) {
    if (check) {
      options.output?.log?.("would ask to configure OpenCodex Sisyphus routing");
      return { changed: [], configPath, rulePath, configured: false, prompted: false };
    }

    const accepted = await shouldConfigureOpenCodex(options);
    if (!accepted) {
      options.output?.log?.("OpenCodex Sisyphus routing: skipped");
      return { changed: [], configPath, rulePath, configured: false, prompted: true };
    }

    runOpenCodexEnsure(env);
  }

  return {
    ...syncSisyphusMainRouting({ check, env }),
    configured: true,
    prompted: !isOpenCodexActive(currentText)
  };
}

export function syncSisyphusMainRouting(options = {}) {
  const env = options.env ?? process.env;
  const check = options.check === true;
  const codexHome = getCodexHome(env);
  const home = getHome(env);
  const configPath = path.join(codexHome, "config.toml");
  const rulePath = path.join(home, ".opencode", "rules", "hephaestus.md");
  const changed = [];
  if (syncCodexMainModel(configPath, check)) changed.push(configPath);
  if (syncSisyphusRule(rulePath, check)) changed.push(rulePath);

  return { changed, configPath, rulePath };
}

function isOpenCodexActive(text) {
  return (
    readTopLevelTomlString(text, "model_provider") === SISYPHUS_MAIN_PROVIDER ||
    getTableBlock(text, "model_providers.opencodex").length > 0
  );
}

async function shouldConfigureOpenCodex(options) {
  const question = "Configure OpenCodex (ocx) and make Sisyphus the default OMO route on zai/glm-5.2[1m]? [y/N]: ";
  if (typeof options.yesNoSelector === "function") return !!(await options.yesNoSelector({ question }));
  if (!process.stdin.isTTY) {
    options.output?.log?.("OpenCodex Sisyphus routing: missing; skipping prompt in non-interactive mode.");
    return false;
  }

  const rl = options.readline ?? createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise((resolve) => {
      rl.question(question, resolve);
    });
    return /^y(?:es)?$/i.test(String(answer).trim());
  } finally {
    if (!options.readline) rl.close();
  }
}

function runOpenCodexEnsure(env) {
  const bin = env.LFP_OCX_BIN?.trim() || "npx";
  const args = parseOcxArgs(env.LFP_OCX_ARGS, ["--yes", "@islee23520/opencodex@latest", "ensure"]);
  const result = spawnSync(bin, args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  if (result.error !== undefined) throw result.error;
  if (result.status === 0) return;

  throw new Error(`ocx setup failed with exit code ${result.status}`);
}

function parseOcxArgs(value, defaultArgs) {
  if (value === undefined || value.trim().length === 0) return defaultArgs;
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error("LFP_OCX_ARGS must be a JSON string array");
    }
    return parsed;
  }
  return trimmed.split(/\s+/);
}

function syncCodexMainModel(configPath, check) {
  const currentText = readTextIfExists(configPath);
  const nextText = applyTopLevelStrings(currentText, {
    model_provider: SISYPHUS_MAIN_PROVIDER,
    model: SISYPHUS_MAIN_MODEL,
    model_reasoning_effort: "medium",
    service_tier: "default"
  });
  if (currentText === nextText) return false;

  if (!check) {
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, nextText);
  }
  return true;
}

function syncSisyphusRule(rulePath, check) {
  const currentText = readTextIfExists(rulePath);
  const nextText = `${[
    "---",
    `description: ${SISYPHUS_RULE_DESCRIPTION}`,
    "alwaysApply: true",
    "---",
    "",
    "You are Sisyphus, the default LazyCodex/OMO ultraworker running on OpenCodex `zai/glm-5.2[1m]`.",
    "",
    "Default to routing and orchestration. Keep normal turns lightweight, preserve the user's workspace, and choose the right executor before doing deep work.",
    "",
    "Hephaestus is not removed or unavailable. Hephaestus remains the specialist implementation/execution agent that Sisyphus should spawn when a task needs code changes, file edits, build fixes, runtime debugging, heavy verification, or end-to-end execution.",
    "",
    'When an implementation task should be carried by another agent, spawn or delegate to the Hephaestus executor role. If the available Codex agent surface exposes `multi_agent_v1.spawn_agent`, prefer `agent_type: "hephaestus"`; if that exact role is not installed, use the configured LazyCodex implementation executor such as `lazycodex-executor`.',
    "",
    "Use Sisyphus for intent clarification, routing, decomposition, constraints, and progress control. Use Hephaestus for doing the work Sisyphus assigns.",
    "",
    "Do not claim to be Hephaestus unless an explicit Hephaestus or executor role is selected for the current task, and do not describe Hephaestus as deleted, disabled, or replaced."
  ].join("\n")}\n`;
  if (currentText === nextText) return false;

  if (!check) {
    mkdirSync(path.dirname(rulePath), { recursive: true });
    writeFileSync(rulePath, nextText);
  }
  return true;
}

function applyTopLevelStrings(text, values) {
  let next = text;
  for (const [key, value] of Object.entries(values)) {
    next = upsertTopLevelString(next, key, value);
  }
  return next;
}

function upsertTopLevelString(text, key, value) {
  const line = `${key} = ${JSON.stringify(value)}`;
  const pattern = new RegExp(`(^|\\n)${escapeRegExp(key)}\\s*=\\s*"[^"]*"\\s*(?=\\n|$)`);
  if (pattern.test(text)) return text.replace(pattern, `$1${line}`);

  const firstSection = /^\[[^\n]+]/m.exec(text);
  if (firstSection === null) {
    const separator = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
    return `${text}${separator}${line}\n`;
  }

  const before = text.slice(0, firstSection.index).replace(/\n*$/, "");
  const after = text.slice(firstSection.index).replace(/^\n*/, "");
  return `${before.length > 0 ? `${before}\n` : ""}${line}\n\n${after}`;
}

function readTextIfExists(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function getCodexHome(env) {
  return env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
}

function getHome(env) {
  return env.HOME?.trim() || os.homedir();
}
