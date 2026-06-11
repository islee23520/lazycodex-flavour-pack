#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { configureAgentModelOverrides } from "./agent-model-config.mjs";
import { getCodexAppsToolCacheState } from "./codex-apps-cache.mjs";
import { syncAgentOverrides } from "./sync-agent-overrides.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI = path.join(ROOT, "scripts", "cli.mjs");
const LAZYCODEX_INSTALL_STUB = path.join(ROOT, "test", "fixtures", "lazycodex-install-stub.mjs");
let outputForReadline = null;

const root = mkdtempSync(path.join(tmpdir(), "lfp-isolated-smoke-"));
const codexHome = path.join(root, "codex-home");
const agentsDir = path.join(root, "upstream-agents");
const overrideConfigPath = path.join(root, "omo-agent-model-overrides.toml");
const savedOverridePath = path.join(codexHome, "lfp", "omo-agent-model-overrides.json");

mkdirSync(codexHome, { recursive: true });
mkdirSync(agentsDir, { recursive: true });
mkdirSync(path.dirname(savedOverridePath), { recursive: true });
mkdirSync(path.join(codexHome, "cache", "codex_apps_tools"), { recursive: true });

writeFileSync(
  path.join(codexHome, "config.toml"),
  [
    'model_provider = "openai-compatible"',
    "",
    "[model_providers.openai-compatible]",
    'base_url = "https://api.openai.com/v1"',
    'wire_api = "responses"',
    "requires_openai_auth = true",
    ""
  ].join("\n")
);
writeAgent("explorer", "gpt-5.4-mini", "low", "fast");
writeAgent("metis", "gpt-5.5", "high", "fast");
writeOverrideConfig(overrideConfigPath, agentsDir, {
  explorer: { model: "gpt-5.4-mini", model_reasoning_effort: "low", service_tier: "fast" }
});
writeOverrideConfig(savedOverridePath, null, {
  explorer: { model: "gpt-5.4-mini", model_reasoning_effort: "low", service_tier: "fast" },
  metis: { model: "gpt-5.5", model_reasoning_effort: "high", service_tier: "fast" }
});
writeFileSync(
  path.join(codexHome, "cache", "codex_apps_tools", "duplicate-tools.json"),
  JSON.stringify({
    schema_version: 3,
    tools: [{ tool_name: "_fetch" }, { tool_name: "_fetch" }]
  })
);

const setup = runCli(["setup", "--config", overrideConfigPath, "--skip-art-prompt", "--skip-model-prompt"]);
assertStatus(setup, 0, "setup");

const output = captureOutput();
await configureAgentModelOverrides(overrideConfigPath, {
  env: { ...process.env, CODEX_HOME: codexHome },
  models: ["gpt-5.5", "grok-4.20-0309-non-reasoning", "gpt-5.4-mini"],
  readline: fakeReadline(["y", "", "", "", "1", "1", "3"]),
  output
});
const sync = syncAgentOverrides(overrideConfigPath, { check: false });
const doctor = runCli(["doctor", "--config", overrideConfigPath]);
assertStatus(doctor, 0, "doctor");

const cacheState = getCodexAppsToolCacheState({ env: { CODEX_HOME: codexHome } });
const configText = readFileSync(path.join(codexHome, "config.toml"), "utf8");
const explorerText = readFileSync(path.join(agentsDir, "explorer.toml"), "utf8");
const metisText = readFileSync(path.join(agentsDir, "metis.toml"), "utf8");

assertIncludes(configText, '[plugins."lfp@islee23520"]', "isolated config enables lfp@islee23520");
assertIncludes(configText, "[marketplaces.islee23520]", "isolated config uses islee23520 marketplace");
assertIncludes(explorerText, 'model = "gpt-5.4-mini"', "saved explorer override applied");
assertIncludes(metisText, 'model = "gpt-5.5"', "metis override applied after saved restore");
assertIncludes(metisText, 'model_reasoning_effort = "high"', "metis reasoning applied");
if (!cacheState.healthy) throw new Error(`Codex Apps cache is not clean: ${JSON.stringify(cacheState.duplicateFiles)}`);
if (!output.questions.some((question) => /Adjust LFP model overrides now/.test(question))) {
  throw new Error("Saved override adjust prompt was not shown");
}
if (!output.questions.some((question) => /explorer model/.test(question))) {
  throw new Error("Model override prompts did not continue after saved override restore");
}
if (!sync.changed.some((filePath) => filePath.endsWith("metis.toml"))) {
  throw new Error("Expected metis.toml to be updated by isolated override sync");
}

console.log("isolated smoke: PASS");
console.log(`isolated smoke: CODEX_HOME=${codexHome}`);
console.log(`isolated smoke: setup installed lfp@islee23520=${configText.includes('[plugins."lfp@islee23520"]')}`);
console.log(`isolated smoke: duplicate tool cache healthy=${cacheState.healthy}`);
console.log(`isolated smoke: saved adjust prompt shown=true`);
console.log(`isolated smoke: prompts continued after saved adjust=true`);
console.log(`isolated smoke: updated agents=${sync.changed.map((filePath) => path.basename(filePath)).join(", ")}`);

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      LFP_LAZYCODEX_INSTALL_BIN: process.execPath,
      LFP_LAZYCODEX_INSTALL_ARGS: JSON.stringify([LAZYCODEX_INSTALL_STUB])
    },
    encoding: "utf8"
  });
}

function assertStatus(result, expected, label) {
  if (result.status === expected) return;
  throw new Error(`${label} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function assertIncludes(text, pattern, message) {
  if (!text.includes(pattern)) throw new Error(message);
}

function writeAgent(name, model, reasoning, tier) {
  writeFileSync(
    path.join(agentsDir, `${name}.toml`),
    [
      `name = "${name}"`,
      `model = "${model}"`,
      `model_reasoning_effort = "${reasoning}"`,
      `service_tier = "${tier}"`,
      ""
    ].join("\n")
  );
}

function writeOverrideConfig(filePath, sourceDir, agents) {
  if (filePath.endsWith(".json")) {
    writeFileSync(filePath, `${JSON.stringify({ schemaVersion: 1, overrides: agents }, null, 2)}\n`);
    return;
  }

  const lines = [];
  if (sourceDir !== null) {
    lines.push("[source]", `agents_dir = "${sourceDir}"`, "");
  }
  for (const [agentName, fields] of Object.entries(agents)) {
    lines.push(`[agents.${agentName}]`);
    lines.push(`model = "${fields.model}"`);
    lines.push(`model_reasoning_effort = "${fields.model_reasoning_effort}"`);
    lines.push(`service_tier = "${fields.service_tier}"`);
    lines.push("");
  }
  writeFileSync(filePath, lines.join("\n"));
}

function fakeReadline(answers) {
  return {
    question(question, resolve) {
      outputForReadline?.questions.push(question);
      resolve(answers.shift() ?? "");
    }
  };
}

function captureOutput() {
  outputForReadline = { questions: [] };
  return { log() {}, questions: outputForReadline.questions };
}
