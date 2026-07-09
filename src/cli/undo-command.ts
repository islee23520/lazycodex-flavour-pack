import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { deleteCodexPlugin, getPendingCodexPluginDeleteActions } from "../install/codex-plugin-delete.js";
import { formatLazyCodexInstallCommand, runLazyCodexInstall } from "../install/lazycodex-install.js";
import { GLOBAL_MODEL_FIELDS } from "../model/model-field-scope.js";
import { getUserOverrideConfigPath } from "../model/user-model-overrides.js";
import { formatCheckPreview, printLines } from "./destructive-action-preview.js";

export async function runUndo(argv) {
  const args = parseUndoArgs(argv);
  const actions = getPendingUndoActions(args);

  if (args.check) {
    const lines = formatCheckPreview("undo", actions);
    printLines(lines);
    if (actions.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (args.skipLazycodexInstall) {
    console.log("lfp undo: skipping LazyCodex install; removing only LFP-managed surface.");
  } else {
    runLazyCodexInstall();
  }

  const globalResult = removeSavedGlobalModelOverrides();
  const deleteActions = getPendingCodexPluginDeleteActions().actions;
  deleteCodexPlugin();
  const userConfigPath = removeSavedUserConfig();

  for (const item of deleteActions) console.log(`removed ${item.replace(/^remove /, "")}`);
  for (const item of globalResult.changed) console.log(`removed LFP global model override from ${item}`);
  if (userConfigPath !== null) console.log(`removed saved LFP model config ${userConfigPath}`);
  console.log("lfp undo: restored LazyCodex/OMO original surface");
}

function parseUndoArgs(argv) {
  const parsed = {};
  for (const item of argv) {
    if (item === "--check") {
      parsed.check = true;
      continue;
    }
    if (item === "--skip-lazycodex-install") {
      parsed.skipLazycodexInstall = true;
      continue;
    }
    throw new Error(`Unknown undo option: ${item}`);
  }
  return parsed;
}

function getPendingUndoActions(args) {
  const actions = [];
  if (args.skipLazycodexInstall) {
    actions.push("skip LazyCodex install");
  } else {
    actions.push(`run ${formatLazyCodexInstallCommand()} to restore upstream LazyCodex/OMO files`);
  }

  actions.push(...getPendingCodexPluginDeleteActions().actions);

  const globalResult = removeSavedGlobalModelOverrides({ check: true });
  for (const item of globalResult.changed) actions.push(`remove LFP global model override from ${item}`);

  const userConfigPath = getUserOverrideConfigPath();
  if (existsSync(userConfigPath)) actions.push(`remove saved LFP model config ${userConfigPath}`);

  return actions;
}

function removeSavedUserConfig() {
  const userConfigPath = getUserOverrideConfigPath();
  if (!existsSync(userConfigPath)) return null;
  rmSync(userConfigPath, { force: true });
  return userConfigPath;
}

function removeSavedGlobalModelOverrides(options = {}) {
  const saved = readSavedOverridesIfPresent();
  if (saved === null) return { changed: [] };

  const codexHome = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  const targets = [
    { path: path.join(codexHome, "config.toml"), fields: saved.defaultFields },
    { path: path.join(codexHome, "ulw.config.toml"), fields: saved.ulwFields }
  ];
  const changed = [];

  for (const target of targets) {
    if (!existsSync(target.path) || Object.keys(target.fields).length === 0) continue;
    const current = readFileSync(target.path, "utf8");
    const next = removeMatchingTopLevelFields(current, target.fields);
    if (current === next) continue;
    changed.push(target.path);
    if (!options.check) writeFileSync(target.path, next);
  }

  return { changed };
}

function readSavedOverridesIfPresent() {
  const userConfigPath = getUserOverrideConfigPath();
  if (!existsSync(userConfigPath)) return null;

  const parsed = JSON.parse(readFileSync(userConfigPath, "utf8"));
  const overrides = parsed?.overrides;
  if (typeof overrides !== "object" || overrides === null) return null;

  return {
    defaultFields: pickGlobalFields(overrides.default),
    ulwFields: pickGlobalFields(overrides.ulw)
  };
}

function pickGlobalFields(value) {
  if (typeof value !== "object" || value === null) return {};
  const fields = {};
  for (const key of GLOBAL_MODEL_FIELDS) {
    if (typeof value[key] === "string") fields[key] = value[key];
  }
  return fields;
}

function removeMatchingTopLevelFields(text, fields) {
  const lines = text.split(/\r?\n/);
  const output = [];
  let insideTopLevel = true;

  for (const line of lines) {
    if (insideTopLevel && line.trim().startsWith("[")) insideTopLevel = false;
    const key = line.includes("=") ? line.split("=", 1)[0].trim() : "";
    if (insideTopLevel && Object.hasOwn(fields, key) && readQuotedStringValue(line) === fields[key]) continue;
    output.push(line);
  }

  return `${output.join("\n").replace(/\n*$/, "")}\n`;
}

function readQuotedStringValue(line) {
  return /^\s*[^=]+\s*=\s*"([^"]*)"\s*$/.exec(line)?.[1] ?? null;
}
