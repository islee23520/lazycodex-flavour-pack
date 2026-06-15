#!/usr/bin/env node
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getCodexPluginState, PLUGIN_REF } from "./codex-plugin-install.mjs";
import { syncAgentOverrides, syncGlobalModelDefaults } from "./sync-agent-overrides.mjs";
import { configureArtTeam } from "./art-team-config.mjs";
import { configureAgentModelOverrides } from "./agent-model-config.mjs";
import { runBenchmarkCommand } from "./model-benchmark.mjs";
import { createRestoredUserOverrideConfig } from "./user-model-overrides.mjs";
import { runSetup } from "./setup-command.mjs";
import { parseDoctorArgs, parseSyncArgs } from "./cli-args.mjs";
import {
  printCodexAppsCacheFixApply,
  printCodexAppsCacheFixPreview,
  printArtTeamConfig,
  printCodexAppsCacheState,
  printAgentModelDrift,
  printApplierPreservationStatus,
  printInstallSmokeState,
  printOpenAiCompatProviderState,
  printProviderInventoryVisibility,
  printVisualSmokeState
} from "./cli-reporting.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_CONFIG = path.join(ROOT, "agent-configs", "omo-agent-model-overrides.toml");
const HELP = `lfp

Usage:
  lfp setup [--config <path>] [--agent-models-only|--sync-global-defaults] [--skip-art-prompt] [--skip-model-prompt] [--no-tui]
  lfp dry-setup [--config <path>] [--agent-models-only|--sync-global-defaults]
  lfp doctor [--config <path>] [--fix-cache [--apply]]
  lfp agent-config [--config <path>] [--agent-models-only|--sync-global-defaults]
  lfp benchmark-models [--recommend-only] [--roles <csv>] [--models <csv>] [--samples <n>] [--output <path>] [--dry-run] [--apply]
  lfp art-config
  lfp help

npx:
  npx @islee23520/lfp@latest setup
  npx @islee23520/lfp@latest dry-setup
  npx @islee23520/lfp@latest doctor
  npx @islee23520/lfp@latest agent-config
  npx @islee23520/lfp@latest benchmark-models
  npx @islee23520/lfp@latest art-config

Commands:
  setup            Install LFP plugin, agents, and overrides into Codex.
                   Interactive: asks whether to edit art team, default, ULW, and OMO model settings.
                   Press Enter to keep and apply the configured values without per-agent prompts.
                   If provider models are discoverable, setup shows recommendations while
                   Enter keeps and re-applies each configured agent value.
  dry-setup        Preview what setup would do without writing.
  doctor           Check LFP install status, agent models, and overrides.
  agent-config     Reconfigure LazyCodex/OMO agent model overrides and apply them.
  benchmark-models Recommend or benchmark role-based model routing against the active OpenAI-compatible provider.
  art-config       Reconfigure art team models (interactive prompt).
  help             Show this help.

Flags:
  --config <path>  Use a specific override config file.
  --fix-cache  Check duplicate Codex Apps tool cache files.
  --apply  With doctor --fix-cache, quarantine duplicate cache files.
  --skip-art-prompt  Skip the interactive art team model prompt during setup.
  --skip-model-prompt  Skip the interactive OMO override model prompt during setup.
  --skip-lazycodex-install  Local development only: install this checkout without running LazyCodex install first.
  --no-tui  Force legacy line-output setup even when running in an interactive terminal.
  --agent-models-only  Apply only installed agent TOMLs and saved overrides; preserve Codex global defaults. This is the default.
  --sync-global-defaults  Explicit legacy mode: also sync default and ULW virtual sections into Codex config.toml.
  --roles  With benchmark-models, comma-separated role names to test.
  --models  With benchmark-models, comma-separated model ids to test.
  --samples  With benchmark-models, repeated samples per role/model.
  --output  With benchmark-models, JSON result path under .omo/benchmark-results by default.
  --recommend-only  With benchmark-models, use prebenchmarked family routing over active /v1/models without completion calls.
  --dry-run  With benchmark-models, score scenarios without provider calls.
  --apply  With benchmark-models, write winning model fields to saved LFP overrides.

This package is a lightweight overlay. setup runs npx lazycodex-ai install before applying LFP, then installs/enables this pack in Codex and applies configured overrides to existing agents. Agent model application preserves top-level Codex defaults unless --sync-global-defaults is passed.`;

if (isDirectRun()) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
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
    await runDoctor(args);
    return;
  }

  if (command === "agent-config") {
    await runAgentConfig(args);
    return;
  }

  if (command === "benchmark-models") {
    const result = await runBenchmarkCommand(args, { output: console });
    if (result.applied.length > 0) console.log("global defaults: preserved (agent-only mode)");
    return;
  }

  if (command === "art-config") {
    await runArtConfig(args);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

async function runDoctor(argv) {
  const args = parseDoctorArgs(argv);
  if (args.check !== undefined) throw new Error("doctor does not accept --check; use dry-setup instead");
  if (args.apply && !args.fixCache) throw new Error("doctor --apply requires --fix-cache");
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
  await printProviderInventoryVisibility({ commandName: "doctor" });
  printApplierPreservationStatus({ commandName: "doctor" });
  const installSmokeOk = printInstallSmokeState();
  hasIssue ||= !installSmokeOk;
  const visualSmokeOk = printVisualSmokeState();
  hasIssue ||= !visualSmokeOk;
  const appCacheOk = printDoctorCodexAppsCacheState(args);
  hasIssue ||= !appCacheOk;

  printArtTeamConfig();

  try {
    const effectiveConfigPath = effectiveConfig?.configPath ?? configPath;
    const driftResult = printAgentModelDrift(effectiveConfigPath, { commandName: "doctor" });
    hasIssue ||= !driftResult.ok;
    const result = syncAgentOverrides(effectiveConfigPath, { check: true });
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

function printDoctorCodexAppsCacheState(args) {
  if (!args.fixCache) return printCodexAppsCacheState();
  if (args.apply) return printCodexAppsCacheFixApply();
  return printCodexAppsCacheFixPreview();
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
    if (process.stdin.isTTY) {
      await configureAgentModelOverrides(configPath, { readline: rl, output: console });
    } else {
      await configureAgentModelOverrides(configPath, { interactive: false });
      console.log("agent-config: non-interactive; applying configured values.");
    }
  } finally {
    rl.close();
  }

  const result = syncAgentOverrides(configPath, { check: false });
  for (const item of result.changed) console.log(`updated ${item}`);
  if (result.changed.length === 0) console.log("agent overrides already applied");
  if (args.syncGlobalDefaults) {
    const globalResult = syncGlobalModelDefaults(configPath, { check: false });
    for (const item of globalResult.changed) console.log(`updated global model defaults in ${item}`);
  } else {
    console.log("global defaults: preserved (agent-only mode)");
  }
}

function getDefaultInstalledOverrideConfigPath() {
  const state = getCodexPluginState();
  if (state.pluginFilesInstalled) {
    return path.join(state.pluginRoot, "agent-configs", "omo-agent-model-overrides.toml");
  }
  return DEFAULT_CONFIG;
}

function isDirectRun() {
  if (process.argv[1] === undefined) return false;
  return (
    import.meta.url === pathToFileURL(process.argv[1]).href ||
    ["cli.mjs", "lfp"].includes(path.basename(process.argv[1]))
  );
}
