import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const WRITABLE_FIELDS = ["model", "model_reasoning_effort", "service_tier"];
const LFP_AGENT_NAMES = new Set(["artistry", "artistry-gen", "artistry-qa", "visual-engineering", "visual-looker"]);

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
      model: readTomlString(text, "model"),
      model_reasoning_effort: readTomlString(text, "model_reasoning_effort"),
      service_tier: readTomlString(text, "service_tier")
    });
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

export function writeOverrideFields(configPath, overrides) {
  if (!configPath.endsWith(".toml")) return;

  const lines = readFileSync(configPath, "utf8").split(/\r?\n/);
  const output = [];
  let section = null;
  const seenAgentSections = new Set();

  for (const line of lines) {
    const sectionMatch = line.trim().match(/^\[([A-Za-z0-9_.-]+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (section.startsWith("agents.")) seenAgentSections.add(section.slice("agents.".length));
    }

    const agentName = section?.startsWith("agents.") ? section.slice("agents.".length) : null;
    const key = line.includes("=") ? line.split("=", 1)[0].trim() : "";
    if (agentName !== null && WRITABLE_FIELDS.includes(key) && overrides[agentName]?.[key]) {
      output.push(`${key} = ${JSON.stringify(String(overrides[agentName][key]))}`);
      continue;
    }

    output.push(line);
  }

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

function readTomlString(text, key) {
  const match = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, "m").exec(text);
  return match?.[1] ?? null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
