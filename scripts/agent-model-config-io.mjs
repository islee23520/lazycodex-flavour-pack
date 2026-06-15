import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { AGENT_MODEL_FIELDS } from "./model-field-scope.mjs";
import { readTomlString } from "./toml-string-utils.mjs";

const WRITABLE_FIELDS = [...AGENT_MODEL_FIELDS];
const LFP_AGENT_NAMES = new Set(["artistry", "artistry-gen", "artistry-qa", "sisyphus", "visual-engineering", "visual-looker"]);

export function discoverAdditionalAgents(sourceDir, overrides) {
  if (typeof sourceDir !== "string") return [];
  const configured = new Set(Object.keys(overrides ?? {}));
  const agents = [];

  for (const fileName of safeReadDir(sourceDir)) {
    if (!fileName.endsWith(".toml")) continue;
    const name = fileName.slice(0, -".toml".length);
    if (configured.has(name) || LFP_AGENT_NAMES.has(name)) continue;

    const text = readFileSync(path.join(sourceDir, fileName), "utf8");
    agents.push({
      name,
      ...readModelFields(text)
    });
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

export function writeOverrideFields(configPath, overrides) {
  if (!configPath.endsWith(".toml")) return;

  const lines = readFileSync(configPath, "utf8").split(/\r?\n/);
  const output = [];
  let section = null;
  let agentName = null;
  let writtenFields = new Set();
  const seenAgentSections = new Set();

  const flushMissingFields = () => {
    if (agentName === null) return;
    const fields = overrides[agentName];
    for (const key of WRITABLE_FIELDS) {
      if (fields?.[key] && !writtenFields.has(key)) {
        output.push(`${key} = ${JSON.stringify(String(fields[key]))}`);
        writtenFields.add(key);
      }
    }
  };

  for (const line of lines) {
    const sectionMatch = line.trim().match(/^\[([A-Za-z0-9_.-]+)]$/);
    if (sectionMatch) {
      flushMissingFields();
      section = sectionMatch[1];
      agentName = section.startsWith("agents.") ? section.slice("agents.".length) : null;
      writtenFields = new Set();
      if (agentName !== null) seenAgentSections.add(agentName);
    }

    const key = line.includes("=") ? line.split("=", 1)[0].trim() : "";
    if (agentName !== null && WRITABLE_FIELDS.includes(key)) {
      writtenFields.add(key);
      if (overrides[agentName]?.[key]) {
        output.push(`${key} = ${JSON.stringify(String(overrides[agentName][key]))}`);
        continue;
      }
    }

    output.push(line);
  }
  flushMissingFields();

  for (const [agentName, fields] of Object.entries(overrides)) {
    if (seenAgentSections.has(agentName)) continue;
    output.push("", `[agents.${agentName}]`);
    for (const key of WRITABLE_FIELDS) {
      if (fields?.[key]) output.push(`${key} = ${JSON.stringify(String(fields[key]))}`);
    }
  }

  writeFileSync(configPath, `${output.join("\n").replace(/\n*$/, "")}\n`);
}

function safeReadDir(sourceDir) {
  try {
    return readdirSync(sourceDir);
  } catch {
    return [];
  }
}

function readModelFields(text) {
  const fields = {};
  for (const key of WRITABLE_FIELDS) fields[key] = readTomlString(text, key);
  return fields;
}
