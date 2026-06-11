#!/usr/bin/env node
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getCodexPluginState, PLUGIN_REF } from "./codex-plugin-install.mjs";
import { syncAgentOverrides } from "./sync-agent-overrides.mjs";
import { configureArtTeam } from "./art-team-config.mjs";
import { configureAgentModelOverrides } from "./agent-model-config.mjs";
import { createRestoredUserOverrideConfig } from "./user-model-overrides.mjs";
import { runSetup } from "./setup-command.mjs";
import {
  printArtTeamConfig,
  printCodexAppsCacheState,
  printInstallSmokeState,
  printOpenAiCompatProviderState,
  printVisualSmokeState
} from "./cli-reporting.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_CONFIG = path.join(ROOT, "agent-configs", "omo-agent-model-overrides.toml");
const SYNC_OPTIONS = new Set(["--check", "--config", "--skip-art-prompt", "--skip-model-prompt", "--skip-lazycodex-install"]);
const KOREAN_POSTPOSITIONS = ["으로", "부터", "까지", "에게", "에서", "처럼", "보다", "만큼", "은", "는", "이", "가", "을", "를", "와", "과", "도", "만", "로"];

const HELP = `lfp

Usage:
  lfp setup [--config <path>] [--skip-art-prompt] [--skip-model-prompt]
  lfp dry-setup [--config <path>]
  lfp doctor [--config <path>]
  lfp agent-config [--config <path>]
  lfp art-config
  lfp help

npx:
  npx @islee23520/lfp@latest setup
  npx @islee23520/lfp@latest dry-setup
  npx @islee23520/lfp@latest doctor
  npx @islee23520/lfp@latest agent-config
  npx @islee23520/lfp@latest art-config

Commands:
  setup            Install LFP plugin, agents, and overrides into Codex.
                   Interactive: asks about art team models (optional). OMO model overrides only
                   prompt on installed setup or when you have previously saved custom settings.
                   If provider models are discoverable, setup can auto-select recommended models.
  dry-setup        Preview what setup would do without writing.
  doctor           Check LFP install status, agent models, and overrides.
  agent-config     Reconfigure LazyCodex/OMO agent model overrides and apply them.
  art-config       Reconfigure art team models (interactive prompt).
  help             Show this help.

Flags:
  --config <path>  Use a specific override config file.
  --skip-art-prompt  Skip the interactive art team model prompt during setup.
  --skip-model-prompt  Skip the interactive OMO override model prompt during setup.
  --skip-lazycodex-install  Local development only: install this checkout without running LazyCodex install first.

This package is a lightweight overlay. setup runs npx lazycodex-ai install before applying LFP, then installs/enables this pack in Codex and applies configured overrides to existing agents.`;

if (isDirectRun()) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export async function runCli(argv) {
  const [command = "help", ...args] = argv;

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  if (command === "setup") {
    await runSetup(parseSyncArgs(args), { check: false, root: ROOT, defaultConfig: DEFAULT_CONFIG });
    return;
  }

  if (command === "dry-setup") {
    await runSetup(parseSyncArgs(args), { check: true, root: ROOT, defaultConfig: DEFAULT_CONFIG });
    return;
  }

  if (command === "doctor") {
    runDoctor(args);
    return;
  }

  if (command === "agent-config") {
    await runAgentConfig(args);
    return;
  }

  if (command === "art-config") {
    await runArtConfig(args);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

function runDoctor(argv) {
  const args = parseSyncArgs(argv);
  if (args.check !== undefined) throw new Error("doctor does not accept --check; use dry-setup instead");
  const state = getCodexPluginState();
  const configPath =
    args.config ?? (state.pluginFilesInstalled ? path.join(state.pluginRoot, "agent-configs", "omo-agent-model-overrides.toml") : DEFAULT_CONFIG);
  const effectiveConfig = getEffectiveReadOnlyOverrideConfig(configPath, args);
  let hasIssue = false;

  console.log(`lfp doctor: Codex home: ${state.codexHome}`);
  console.log(`lfp doctor: plugin files: ${state.pluginFilesInstalled ? "installed" : "missing"} (${state.pluginRoot})`);
  console.log(
    `lfp doctor: LFP agents: ${state.additionalAgentsInstalled ? "installed" : "missing"} (${state.additionalAgentFiles.join(", ")})`
  );
  console.log(`lfp doctor: marketplace config: ${state.marketplaceConfigured ? "configured" : "missing"} (${state.configPath})`);
  console.log(`lfp doctor: plugin config: ${state.pluginEnabled ? "enabled" : "missing"} (${PLUGIN_REF})`);
  hasIssue ||= !state.pluginFilesInstalled || !state.additionalAgentsInstalled || !state.marketplaceConfigured || !state.pluginEnabled;
  printOpenAiCompatProviderState(state);
  hasIssue ||= state.openAiCompatProvider.status === "drifted";
  const installSmokeOk = printInstallSmokeState();
  hasIssue ||= !installSmokeOk;
  const visualSmokeOk = printVisualSmokeState();
  hasIssue ||= !visualSmokeOk;
  const appCacheOk = printCodexAppsCacheState();
  hasIssue ||= !appCacheOk;

  printArtTeamConfig();

  try {
    const result = syncAgentOverrides(effectiveConfig?.configPath ?? configPath, { check: true });
    if (result.changed.length === 0) {
      console.log("lfp doctor: agent overrides: already applied");
    } else {
      console.log("lfp doctor: agent overrides: setup would update:");
      for (const item of result.changed) console.log(`would update ${item}`);
    }
  } catch (error) {
    hasIssue = true;
    console.log(`lfp doctor: LazyCodex/OMO: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    effectiveConfig?.cleanup();
  }

  if (hasIssue) process.exitCode = 1;
}

function getEffectiveReadOnlyOverrideConfig(configPath, args) {
  if (args.config !== undefined) return null;
  return createRestoredUserOverrideConfig(configPath);
}

async function runArtConfig() {
  console.log("Reconfiguring art team models...\n");
  await configureArtTeam();
  console.log("Run 'lfp setup' to reinstall agents with updated models.");
}

async function runAgentConfig(argv) {
  const args = parseSyncArgs(argv);
  const configPath = args.config ?? getDefaultInstalledOverrideConfigPath();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log("Reconfiguring LazyCodex/OMO agent model overrides...\n");
    await configureAgentModelOverrides(configPath, { readline: rl, output: console });
  } finally {
    rl.close();
  }

  const result = syncAgentOverrides(configPath, { check: false });
  for (const item of result.changed) console.log(`updated ${item}`);
  if (result.changed.length === 0) console.log("agent overrides already applied");
}

function getDefaultInstalledOverrideConfigPath() {
  const state = getCodexPluginState();
  if (state.pluginFilesInstalled) {
    return path.join(state.pluginRoot, "agent-configs", "omo-agent-model-overrides.toml");
  }
  return DEFAULT_CONFIG;
}

function parseSyncArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeSyncOption(argv[index]);
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
    if (item === "--skip-art-prompt") {
      parsed.skipArtPrompt = true;
      continue;
    }
    if (item === "--skip-model-prompt") {
      parsed.skipModelPrompt = true;
      continue;
    }
    if (item === "--skip-lazycodex-install") {
      parsed.skipLazycodexInstall = true;
      continue;
    }
    throw new Error(`Unknown sync option: ${item}`);
  }
  return parsed;
}

function normalizeSyncOption(item) {
  if (SYNC_OPTIONS.has(item)) return item;
  if (!item.startsWith("--")) return item;

  for (const postposition of KOREAN_POSTPOSITIONS) {
    if (!item.endsWith(postposition)) continue;
    const normalized = item.slice(0, -postposition.length);
    if (SYNC_OPTIONS.has(normalized)) return normalized;
  }

  return item;
}

function isDirectRun() {
  if (process.argv[1] === undefined) return false;
  return (
    import.meta.url === pathToFileURL(process.argv[1]).href ||
    ["cli.mjs", "lfp"].includes(path.basename(process.argv[1]))
  );
}
