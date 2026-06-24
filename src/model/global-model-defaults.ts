import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { GLOBAL_MODEL_FIELDS } from "./model-field-scope.js";
import { readOverrideConfig } from "./model-override-config.js";

export function syncGlobalModelDefaults(configPath, options = {}) {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  const globalConfigPath = path.join(codexHome, "config.toml");
  const ulwConfigPath = path.join(codexHome, "ulw.config.toml");

  let overrideConfig;
  try {
    overrideConfig = readOverrideConfig(configPath, options);
  } catch (error) {
    return { changed: [], globalConfigPath, error: error.message };
  }

  const overrides = overrideConfig.overrides ?? {};
  const defaultFields = pickModelFields(overrides.default ?? {});
  const ulwFields = pickModelFields(overrides.ulw ?? {});
  if (Object.keys(defaultFields).length === 0 && Object.keys(ulwFields).length === 0) {
    return { changed: [], globalConfigPath };
  }

  let currentText = "";
  try {
    currentText = readFileSync(globalConfigPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  let nextText = currentText;
  if (Object.keys(defaultFields).length > 0) {
    nextText = applyTopLevelModelFields(nextText, defaultFields);
  }
  if (Object.keys(ulwFields).length > 0) {
    nextText = removeSection(nextText, "profiles.ulw");
  }

  let currentUlwText = "";
  try {
    currentUlwText = readFileSync(ulwConfigPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  let nextUlwText = currentUlwText;
  if (Object.keys(ulwFields).length > 0) {
    nextUlwText = applyTopLevelModelFields(nextUlwText, ulwFields);
  }

  const changed = [];
  if (currentText !== nextText) changed.push(globalConfigPath);
  if (currentUlwText !== nextUlwText) changed.push(ulwConfigPath);
  if (changed.length === 0) {
    return { changed, globalConfigPath, ulwConfigPath };
  }

  if (!options.check) {
    mkdirSync(codexHome, { recursive: true });
    if (currentText !== nextText) writeFileSync(globalConfigPath, nextText);
    if (currentUlwText !== nextUlwText) writeFileSync(ulwConfigPath, nextUlwText);
  }

  return { changed, globalConfigPath, ulwConfigPath };
}

function pickModelFields(fields) {
  const relevant = {};
  for (const key of GLOBAL_MODEL_FIELDS) {
    if (Object.hasOwn(fields, key)) relevant[key] = fields[key];
  }
  return relevant;
}

function applyTopLevelModelFields(text, values) {
  const lines = text.trim().length === 0 ? [] : text.split(/\r?\n/);
  const output = [];
  const seen = new Set();
  let firstSectionIdx = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (firstSectionIdx === -1 && line.trim().startsWith("[")) {
      firstSectionIdx = i;
    }
    const key = line.includes("=") ? line.split("=", 1)[0].trim() : "";
    if (firstSectionIdx === -1 && GLOBAL_MODEL_FIELDS.has(key) && Object.hasOwn(values, key)) {
      output.push(`${key} = ${JSON.stringify(String(values[key]))}`);
      seen.add(key);
      continue;
    }
    output.push(line);
  }

  const toInsert = [];
  for (const key of [...GLOBAL_MODEL_FIELDS].reverse()) {
    if (Object.hasOwn(values, key) && !seen.has(key)) {
      toInsert.unshift(`${key} = ${JSON.stringify(String(values[key]))}`);
    }
  }

  if (toInsert.length > 0) {
    if (firstSectionIdx === -1) {
      output.push(...toInsert);
    } else {
      output.splice(firstSectionIdx, 0, ...toInsert);
    }
  }

  return `${output.join("\n").replace(/\n*$/, "")}\n`;
}

function removeSection(text, sectionName) {
  const lines = text.split(/\r?\n/);
  const output = [];
  let skipping = false;

  for (const line of lines) {
    const sectionMatch = line.trim().match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      skipping = sectionMatch[1] === sectionName;
      if (!skipping) output.push(line);
      continue;
    }

    if (!skipping) output.push(line);
  }

  return `${output.join("\n").replace(/\n*$/, "")}\n`;
}
