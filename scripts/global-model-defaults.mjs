import os from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { GLOBAL_MODEL_FIELDS } from "./model-field-scope.mjs";
import { readOverrideConfig } from "./model-override-config.mjs";

export function syncGlobalModelDefaults(configPath, options = {}) {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  const globalConfigPath = path.join(codexHome, "config.toml");

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
    nextText = applySectionModelFields(nextText, "profiles.ulw", ulwFields);
  }
  if (currentText === nextText) {
    return { changed: [], globalConfigPath };
  }

  if (!options.check) {
    writeFileSync(globalConfigPath, nextText);
  }

  return { changed: [globalConfigPath], globalConfigPath };
}

function pickModelFields(fields) {
  const relevant = {};
  for (const key of GLOBAL_MODEL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) relevant[key] = fields[key];
  }
  return relevant;
}

function applyTopLevelModelFields(text, values) {
  const lines = text.split(/\r?\n/);
  const output = [];
  const seen = new Set();
  let firstSectionIdx = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (firstSectionIdx === -1 && line.trim().startsWith("[")) {
      firstSectionIdx = i;
    }
    const key = line.includes("=") ? line.split("=", 1)[0].trim() : "";
    if (firstSectionIdx === -1 && GLOBAL_MODEL_FIELDS.has(key) && Object.prototype.hasOwnProperty.call(values, key)) {
      output.push(`${key} = ${JSON.stringify(String(values[key]))}`);
      seen.add(key);
      continue;
    }
    output.push(line);
  }

  const toInsert = [];
  for (const key of [...GLOBAL_MODEL_FIELDS].reverse()) {
    if (Object.prototype.hasOwnProperty.call(values, key) && !seen.has(key)) {
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

function applySectionModelFields(text, sectionName, values) {
  const lines = text.split(/\r?\n/);
  const output = [];
  const seen = new Set();
  let inTargetSection = false;
  let foundSection = false;
  let insertAt = -1;

  for (const line of lines) {
    const sectionMatch = line.trim().match(/^\[([A-Za-z0-9_.-]+)]$/);
    if (sectionMatch) {
      if (inTargetSection && insertAt === -1) insertAt = output.length;
      inTargetSection = sectionMatch[1] === sectionName;
      foundSection ||= inTargetSection;
      output.push(line);
      if (inTargetSection) insertAt = output.length;
      continue;
    }

    const key = line.includes("=") ? line.split("=", 1)[0].trim() : "";
    if (inTargetSection && GLOBAL_MODEL_FIELDS.has(key) && Object.prototype.hasOwnProperty.call(values, key)) {
      output.push(`${key} = ${JSON.stringify(String(values[key]))}`);
      seen.add(key);
      insertAt = output.length;
      continue;
    }

    output.push(line);
    if (inTargetSection && line.trim().length > 0) insertAt = output.length;
  }

  const missingLines = [];
  for (const key of GLOBAL_MODEL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(values, key) && !seen.has(key)) {
      missingLines.push(`${key} = ${JSON.stringify(String(values[key]))}`);
    }
  }

  if (!foundSection) {
    if (output.at(-1)?.trim() !== "") output.push("");
    output.push(`[${sectionName}]`, ...missingLines);
  } else if (missingLines.length > 0) {
    output.splice(insertAt, 0, ...missingLines);
  }

  return `${output.join("\n").replace(/\n*$/, "")}\n`;
}
