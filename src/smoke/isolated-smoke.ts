import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getCodexAppsToolCacheState } from "../codex/codex-apps-cache.js";
import { configureAgentModelOverrides } from "../model/agent-model-config.js";
import { syncAgentOverrides } from "../model/sync-agent-overrides.js";
import { getPackageRoot } from "../utils/package-root.js";

const ROOT = getPackageRoot(import.meta.url);
const CLI = path.join(ROOT, "scripts", "cli.mjs");
const LAZYCODEX_INSTALL_STUB = path.join(ROOT, "test", "fixtures", "lazycodex-install-stub.mjs");
let outputForReadline = null;

const root = mkdtempSync(path.join(tmpdir(), "lfp-isolated-smoke-"));
const codexHome = path.join(root, "codex-home");
const agentsDir = path.join(root, "upstream-agents");
const overrideConfigPath = path.join(root, "omo-agent-model-overrides.toml");
const savedOverridePath = path.join(codexHome, "lfp.json");

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
writeOmo411UltraworkAgents();
writeOverrideConfig(overrideConfigPath, agentsDir, {
  default: { model: "grok-4.20-0309-reasoning", model_reasoning_effort: "xhigh", service_tier: "default" },
  ulw: { model: "grok-4.20-0309-reasoning", model_reasoning_effort: "xhigh", service_tier: "default" },
  "lazycodex-executor": { model: "gpt-5.5", model_reasoning_effort: "high", service_tier: "default" },
  "lazycodex-code-reviewer": { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "default" },
  "lazycodex-qa-executor": { model: "gpt-5.5", model_reasoning_effort: "medium", service_tier: "default" },
  "lazycodex-gate-reviewer": { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "default" },
  "lazycodex-clone-fidelity-reviewer": { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "default" },
  explorer: { model: "gpt-5.4-mini", model_reasoning_effort: "low", service_tier: "fast" },
  librarian: { model: "gpt-5.4-mini", model_reasoning_effort: "low", service_tier: "fast" },
  metis: { model: "gpt-5.5", model_reasoning_effort: "high", service_tier: "default" },
  momus: { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "default" },
  plan: { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "default" }
});
writeOverrideConfig(savedOverridePath, null, {
  default: { model: "gpt-5.5", model_reasoning_effort: "high", service_tier: "default" },
  ulw: { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "default" },
  "lazycodex-executor": { model: "gpt-5.5", model_reasoning_effort: "high", service_tier: "default" },
  "lazycodex-code-reviewer": { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "default" },
  "lazycodex-qa-executor": { model: "gpt-5.5", model_reasoning_effort: "medium", service_tier: "default" },
  "lazycodex-gate-reviewer": { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "default" },
  "lazycodex-clone-fidelity-reviewer": { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "default" },
  explorer: { model: "gpt-5.4-mini", model_reasoning_effort: "low", service_tier: "fast" },
  librarian: { model: "gpt-5.4-mini", model_reasoning_effort: "low", service_tier: "fast" },
  metis: { model: "gpt-5.5", model_reasoning_effort: "high", service_tier: "fast" },
  momus: { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "default" },
  plan: { model: "gpt-5.5", model_reasoning_effort: "xhigh", service_tier: "default" }
});
writeFileSync(
  path.join(codexHome, "cache", "codex_apps_tools", "duplicate-tools.json"),
  JSON.stringify({
    schema_version: 3,
    tools: [{ tool_name: "_fetch" }, { tool_name: "_fetch" }]
  })
);

const setup = runCli(["setup", "--config", overrideConfigPath, "--skip-model-prompt"]);
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

const installedAgentsDir = path.join(codexHome, "agents");
for (const agent of ["oracle", "prometheus", "hephaestus", "atlas", "sisyphus-junior"]) {
  const agentPath = path.join(installedAgentsDir, `${agent}.toml`);
  if (existsSync(agentPath)) throw new Error(`isolated smoke: ${agent}.toml must not be installed`);
}

const cacheState = getCodexAppsToolCacheState({ env: { CODEX_HOME: codexHome } });
const configText = readFileSync(path.join(codexHome, "config.toml"), "utf8");
const ulwConfigText = readFileSync(path.join(codexHome, "ulw.config.toml"), "utf8");
const explorerText = readFileSync(path.join(agentsDir, "explorer.toml"), "utf8");
const metisText = readFileSync(path.join(agentsDir, "metis.toml"), "utf8");
const momusText = readFileSync(path.join(agentsDir, "momus.toml"), "utf8");
const planText = readFileSync(path.join(agentsDir, "plan.toml"), "utf8");
const codeReviewerText = readFileSync(path.join(agentsDir, "lazycodex-code-reviewer.toml"), "utf8");
const qaExecutorText = readFileSync(path.join(agentsDir, "lazycodex-qa-executor.toml"), "utf8");

assertIncludes(configText, '[plugins."lfp@islee23520"]', "isolated config enables lfp@islee23520");
assertIncludes(configText, "[marketplaces.islee23520]", "isolated config uses islee23520 marketplace");
assertExcludes(configText, "[profiles.ulw]", "legacy ULW profile table removed from base config");
assertIncludes(ulwConfigText, 'model = "grok-4.20-0309-reasoning"', "ULW profile defaults applied");
assertIncludes(explorerText, 'model = "gpt-5.4-mini"', "LazyCodex explorer original model preserved");
assertIncludes(metisText, 'model = "gpt-5.5"', "LazyCodex metis original model preserved");
assertIncludes(metisText, 'model_reasoning_effort = "high"', "LazyCodex metis original reasoning preserved");
assertIncludes(momusText, 'model_reasoning_effort = "xhigh"', "current OMO momus xhigh reasoning preserved");
assertIncludes(planText, 'model_reasoning_effort = "xhigh"', "current OMO plan xhigh reasoning preserved");
assertIncludes(
  codeReviewerText,
  'model_reasoning_effort = "xhigh"',
  "LazyCodex code reviewer xhigh reasoning preserved"
);
assertIncludes(qaExecutorText, 'model_reasoning_effort = "medium"', "LazyCodex QA executor medium reasoning preserved");
assertManagedOmoAgents(overrideConfigPath, 10);
if (!cacheState.healthy) throw new Error(`Codex Apps cache is not clean: ${JSON.stringify(cacheState.duplicateFiles)}`);
if (!output.questions.some((question) => /Adjust LFP model overrides now/.test(question))) {
  throw new Error("Saved override adjust prompt was not shown");
}
if (!output.questions.some((question) => /explorer model/.test(question))) {
  throw new Error("Model override prompts did not continue after saved override restore");
}
if (sync.skippedReadOnly.length > 0) {
  throw new Error(`Expected no read-only skipped agents: ${sync.skippedReadOnly.join(", ")}`);
}
if (!readFileSync(savedOverridePath, "utf8").includes('"schemaVersion": 2')) {
  throw new Error("Expected lfp.json saved override config to be created");
}

console.log("isolated smoke: PASS");
console.log(`isolated smoke: CODEX_HOME=${codexHome}`);
console.log(`isolated smoke: setup installed lfp@islee23520=${configText.includes('[plugins."lfp@islee23520"]')}`);
console.log(`isolated smoke: ulw profile synced=${ulwConfigText.includes('model = "grok-4.20-0309-reasoning"')}`);
console.log(`isolated smoke: lazycodex 4.11 momus xhigh=${momusText.includes('model_reasoning_effort = "xhigh"')}`);
console.log(`isolated smoke: lazycodex 4.11 plan xhigh=${planText.includes('model_reasoning_effort = "xhigh"')}`);
console.log(`isolated smoke: omo managed agents=${countManagedOmoAgents(overrideConfigPath)}`);
console.log(
  `isolated smoke: lazycodex 4.11 code reviewer xhigh=${codeReviewerText.includes('model_reasoning_effort = "xhigh"')}`
);
console.log(
  `isolated smoke: lazycodex 4.11 qa executor medium=${qaExecutorText.includes('model_reasoning_effort = "medium"')}`
);
console.log(`isolated smoke: duplicate tool cache healthy=${cacheState.healthy}`);
console.log(`isolated smoke: saved adjust prompt shown=true`);
console.log(`isolated smoke: prompts continued after saved adjust=true`);
console.log(`isolated smoke: updated agents=${sync.changed.map((filePath) => path.basename(filePath)).join(", ")}`);
console.log(`isolated smoke: saved lfp.json created=true`);
console.log(`isolated smoke: lazycodex agents updated=true`);

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

function assertExcludes(text, pattern, message) {
  if (text.includes(pattern)) throw new Error(message);
}

function assertManagedOmoAgents(configPath, expected) {
  const actual = countManagedOmoAgents(configPath);
  if (actual !== expected) throw new Error(`Expected ${expected} managed OMO agents, got ${actual}`);
}

function countManagedOmoAgents(configPath) {
  const text = readFileSync(configPath, "utf8");
  const configuredAgents = new Set([...text.matchAll(/^\[agents\.([^\]]+)]$/gm)].map((match) => match[1]));
  configuredAgents.delete("default");
  configuredAgents.delete("ulw");
  return configuredAgents.size;
}

function writeOmo411UltraworkAgents() {
  writeAgent("lazycodex-executor", "gpt-5.5", "high", "default");
  writeAgent("lazycodex-code-reviewer", "gpt-5.5", "xhigh", "default");
  writeAgent("lazycodex-qa-executor", "gpt-5.5", "medium", "default");
  writeAgent("lazycodex-gate-reviewer", "gpt-5.5", "xhigh", "default");
  writeAgent("lazycodex-clone-fidelity-reviewer", "gpt-5.5", "xhigh", "default");
  writeAgent("explorer", "gpt-5.4-mini", "low", "fast");
  writeAgent("librarian", "gpt-5.4-mini", "low", "fast");
  writeAgent("metis", "gpt-5.5", "high", "default");
  writeAgent("momus", "gpt-5.5", "xhigh", "default");
  writeAgent("plan", "gpt-5.5", "xhigh", "default");
  writeAgent("oracle", "gpt-5.5", "high", "default");
  writeAgent("prometheus", "gpt-5.5", "xhigh", "default");
  writeAgent("hephaestus", "gpt-5.5", "high", "default");
  writeAgent("atlas", "gpt-5.5", "high", "default");
  writeAgent("sisyphus-junior", "gpt-5.5", "medium", "default");
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
    writeFileSync(
      filePath,
      `${JSON.stringify(
        { schemaVersion: 2, source: { agentsDir: "${CODEX_HOME}/agents" }, overrides: agents, rolePolicies: {} },
        null,
        2
      )}\n`
    );
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
