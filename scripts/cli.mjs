#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  getCodexPluginState,
  getInstallSmokeState,
  getPendingCodexPluginActions,
  getVisualSmokeState,
  installCodexPlugin,
  PLUGIN_REF
} from "./codex-plugin-install.mjs";
import { syncAgentOverrides } from "./sync-agent-overrides.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_CONFIG = path.join(ROOT, "agent-configs", "omo-agent-model-overrides.toml");

const HELP = `lfp

Usage:
  lfp setup [--config <path>]
  lfp dry-setup [--config <path>]
  lfp doctor [--config <path>]
  lfp help

npx:
  npx lfp@latest setup
  npx lfp@latest dry-setup
  npx lfp@latest doctor

This package is a lightweight overlay. setup installs/enables this pack in Codex, checks that LazyCodex/OMO is already installed, then applies configured overrides to existing agents. It does not install or update LazyCodex/OMO.`;

if (isDirectRun()) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export function runCli(argv) {
  const [command = "help", ...args] = argv;

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  if (command === "setup") {
    runSetup(args, { check: false });
    return;
  }

  if (command === "dry-setup") {
    runSetup(args, { check: true });
    return;
  }

  if (command === "doctor") {
    runDoctor(args);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

function runSetup(argv, { check }) {
  const args = parseSyncArgs(argv);
  const configPath = args.config ?? DEFAULT_CONFIG;
  const pending = getPendingCodexPluginActions();
  const pendingOverrides = syncAgentOverrides(configPath, { check: true });

  if (check) {
    for (const action of pending.actions) console.log(`would ${action}`);
  } else {
    const installed = installCodexPlugin(ROOT);
    console.log(`installed ${PLUGIN_REF} to ${installed.pluginRoot}`);
    console.log(`installed LFP agents to ${path.join(installed.codexHome, "agents")}`);
    console.log(`enabled ${PLUGIN_REF} in ${installed.configPath}`);
    printInstallSmokeState();
  }

  const result = check ? pendingOverrides : syncAgentOverrides(configPath, { check: false });

  for (const item of result.changed) {
    console.log(`${check ? "would update" : "updated"} ${item}`);
  }

  if (check && (pending.actions.length > 0 || result.changed.length > 0)) process.exitCode = 1;
}

function runDoctor(argv) {
  const args = parseSyncArgs(argv);
  if (args.check !== undefined) throw new Error("doctor does not accept --check; use dry-setup instead");
  const configPath = args.config ?? DEFAULT_CONFIG;
  const state = getCodexPluginState();
  let hasIssue = false;

  console.log(`lfp doctor: Codex home: ${state.codexHome}`);
  console.log(`lfp doctor: plugin files: ${state.pluginFilesInstalled ? "installed" : "missing"} (${state.pluginRoot})`);
  console.log(
    `lfp doctor: LFP agents: ${state.additionalAgentsInstalled ? "installed" : "missing"} (${state.additionalAgentFiles.join(", ")})`
  );
  console.log(`lfp doctor: marketplace config: ${state.marketplaceConfigured ? "configured" : "missing"} (${state.configPath})`);
  console.log(`lfp doctor: plugin config: ${state.pluginEnabled ? "enabled" : "missing"} (${PLUGIN_REF})`);
  hasIssue ||= !state.pluginFilesInstalled || !state.additionalAgentsInstalled || !state.marketplaceConfigured || !state.pluginEnabled;
  const installSmokeOk = printInstallSmokeState();
  hasIssue ||= !installSmokeOk;
  const visualSmokeOk = printVisualSmokeState();
  hasIssue ||= !visualSmokeOk;

  try {
    const result = syncAgentOverrides(configPath, { check: true });
    if (result.changed.length === 0) {
      console.log("lfp doctor: agent overrides: already applied");
    } else {
      console.log("lfp doctor: agent overrides: setup would update:");
      for (const item of result.changed) console.log(`would update ${item}`);
    }
  } catch (error) {
    hasIssue = true;
    console.log(`lfp doctor: LazyCodex/OMO: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (hasIssue) process.exitCode = 1;
}

function printInstallSmokeState() {
  const smoke = getInstallSmokeState();
  if (smoke.explorerPreserved) {
    console.log(`lfp install smoke: explorer preserved (${smoke.explorerPath})`);
    return true;
  }

  console.log(`lfp install smoke: explorer overwrite risk (${smoke.collisions.join(", ")})`);
  return false;
}

function printVisualSmokeState() {
  const smoke = getVisualSmokeState();
  if (smoke.verified) {
    const summary = smoke.checks.map((check) => `${check.name}: ${check.actualModel}`).join(", ");
    console.log(`lfp doctor: visual smoke: verified (${summary})`);
    return true;
  }

  console.log("lfp doctor: visual smoke: failed");
  for (const check of smoke.checks) {
    if (check.status === "verified") continue;
    if (check.status === "missing") {
      console.log(`lfp doctor: visual smoke: ${check.name} missing (${check.filePath})`);
      continue;
    }
    if (check.status === "malformed") {
      console.log(`lfp doctor: visual smoke: ${check.name} missing model (${check.filePath})`);
      continue;
    }
    console.log(
      `lfp doctor: visual smoke: ${check.name} model mismatch: expected ${check.model}, got ${check.actualModel}`
    );
  }
  return false;
}

function parseSyncArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
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
    throw new Error(`Unknown sync option: ${item}`);
  }
  return parsed;
}

function isDirectRun() {
  if (process.argv[1] === undefined) return false;
  return (
    import.meta.url === pathToFileURL(process.argv[1]).href ||
    ["cli.mjs", "lfp"].includes(path.basename(process.argv[1]))
  );
}
