import path from "node:path";
import { createInterface } from "node:readline";

import { configureAgentModelOverrides } from "./agent-model-config.mjs";
import { configureArtTeamIfWanted } from "./art-team-config.mjs";
import { getCodexAppsToolCacheState } from "./codex-apps-cache.mjs";
import { getPendingCodexPluginActions, installCodexPlugin, PLUGIN_REF } from "./codex-plugin-install.mjs";
import { formatLazyCodexInstallCommand, runLazyCodexInstall } from "./lazycodex-install.mjs";
import { promptForYesNo } from "./model-config-prompts.mjs";
import { getProviderConsentPath, readProviderConsent, saveProviderConsent } from "./provider-consent.mjs";
import {
  printCodexAppsCacheQuarantine,
  printInstallSmokeState,
  printOpenAiCompatProviderState
} from "./cli-reporting.mjs";
import { runSetupTui, shouldUseSetupTui } from "./setup-tui.mjs";
import { syncAgentOverrides, syncGlobalModelDefaults } from "./sync-agent-overrides.mjs";
import {
  createRestoredUserOverrideConfig,
  hasSavedUserOverrideConfig,
  migrateLegacyUserOverrideConfig,
  restoreSavedUserOverrideConfigIfPresent
} from "./user-model-overrides.mjs";

export async function runSetup(args, { check, root, defaultConfig }) {
  const context = { check, root, defaultConfig };
  if (shouldUseSetupTui(args, { check, input: process.stdin, output: process.stdout })) {
    await runSetupTui(args, context, { runLineSetup: runSetupLineMode });
    return;
  }

  await runSetupLineMode(args, context);
}

export async function runSetupLineMode(args, { check, root, defaultConfig }) {
  let configPath = args.config ?? defaultConfig;

  if (args.skipLazycodexInstall) {
    console.log(`${check ? "would skip" : "lfp setup: skipping"} LazyCodex install; using local LFP checkout files.`);
  } else if (check) {
    console.log(`would run ${formatLazyCodexInstallCommand()} before applying LFP`);
  } else {
    runLazyCodexInstall();
  }

  const basePending = getPendingCodexPluginActions();
  const installOpenAiCompatProvider = check ? false : await shouldInstallOpenAiCompatProvider(basePending.state);
  const pending = getPendingCodexPluginActions({ installOpenAiCompatProvider });
  const effectiveConfig = check ? getEffectiveReadOnlyOverrideConfig(configPath, args) : null;
  let pendingOverrides;
  try {
    pendingOverrides = syncAgentOverrides(effectiveConfig?.configPath ?? configPath, { check: true });
  } catch (error) {
    effectiveConfig?.cleanup();
    throw error;
  }

  if (check) {
    printPendingSetupActions(pending);
  } else {
    const installedPath = await installAndMaybePrompt(args, root, configPath, installOpenAiCompatProvider, pending);
    if (installedPath === null) return;
    configPath = installedPath;
  }

  const result = check ? pendingOverrides : syncAgentOverrides(configPath, { check: false });
  effectiveConfig?.cleanup();
  const globalResult = syncGlobalDefaults(configPath, check);
  printSetupChanges(result, globalResult, check);

  if (check) {
    const appCacheState = getCodexAppsToolCacheState();
    if (pending.actions.length > 0 || result.changed.length > 0 || appCacheState.duplicateFiles.length > 0) {
      process.exitCode = 1;
    }
  }
}

async function installAndMaybePrompt(args, root, configPath, installOpenAiCompatProvider, pending) {
  printCodexAppsCacheQuarantine();

  if (pending.state.openAiCompatProvider.status === "drifted") {
    printOpenAiCompatProviderState(pending.state);
    process.exitCode = 1;
    return null;
  }

  const installed = installCodexPlugin(root, { installOpenAiCompatProvider });
  const installedConfigPath =
    args.config === undefined ? path.join(installed.pluginRoot, "agent-configs", "omo-agent-model-overrides.toml") : configPath;
  if (args.config === undefined && (args.skipModelPrompt || !process.stdin.isTTY)) {
    const restoredPath = restoreSavedUserOverrideConfigIfPresent(installedConfigPath);
    if (restoredPath !== null) console.log(`applied saved LFP model override config from ${restoredPath} (non-interactive)`);
  }
  console.log(`installed ${PLUGIN_REF} to ${installed.pluginRoot}`);
  console.log(`installed LFP agents to ${path.join(installed.codexHome, "agents")}`);
  console.log(`enabled ${PLUGIN_REF} in ${installed.configPath}`);
  printOpenAiCompatProviderState(installed);
  printInstallSmokeState();

  if (!args.skipArtPrompt && process.stdin.isTTY) await configureArtTeamIfWanted();
  if (!args.skipModelPrompt && process.stdin.isTTY) await maybePromptModelOverrides(args, installedConfigPath);

  return installedConfigPath;
}

async function maybePromptModelOverrides(args, configPath) {
  const userConfigPath = migrateLegacyUserOverrideConfig();
  const shouldPromptModelOverrides = hasSavedUserOverrideConfig(userConfigPath) || args.config === undefined;
  if (!shouldPromptModelOverrides) return;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await configureAgentModelOverrides(configPath, {
      readline: rl,
      output: console,
      recommendModels: true,
      confirmConfiguredValues: true
    });
  } finally {
    rl.close();
  }
}

function printPendingSetupActions(pending) {
  for (const action of pending.actions) console.log(`would ${action}`);
  const appCacheState = getCodexAppsToolCacheState();
  for (const item of appCacheState.duplicateFiles) {
    console.log(`would quarantine duplicate Codex Apps tool cache ${item.filePath} (${item.duplicateToolNames.join(", ")})`);
  }
}

function syncGlobalDefaults(configPath, check) {
  try {
    return syncGlobalModelDefaults(configPath, { check });
  } catch (error) {
    if (!check) console.error(`lfp setup: failed to apply global model defaults: ${error.message}`);
    return null;
  }
}

function printSetupChanges(result, globalResult, check) {
  for (const item of result.changed) console.log(`${check ? "would update" : "updated"} ${item}`);
  if (!globalResult?.changed || globalResult.changed.length === 0) return;

  for (const item of globalResult.changed) {
    console.log(`${check ? "would update global model defaults in" : "updated global model defaults in"} ${item}`);
  }
}

async function shouldInstallOpenAiCompatProvider(state) {
  if (state.anyModelProviderConfigured) {
    console.log("lfp setup: model provider already configured; leaving existing provider untouched.");
    return false;
  }

  const savedConsent = readProviderConsent();
  if (savedConsent !== null) {
    console.log(
      `lfp setup: model provider install consent recorded as ${savedConsent ? "yes" : "no"} in ${getProviderConsentPath()}.`
    );
    return savedConsent;
  }

  if (!process.stdin.isTTY) {
    console.log("lfp setup: model provider missing; skipping provider install in non-interactive mode.");
    return false;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await promptForYesNo(
      rl,
      `Install OpenAI-compatible model provider ${state.openAiCompatProvider.id} in ${state.configPath}? [y/N]: `
    );
    const consentPath = saveProviderConsent(answer);
    console.log(`lfp setup: recorded model provider install consent in ${consentPath}.`);
    return answer;
  } finally {
    rl.close();
  }
}

function getEffectiveReadOnlyOverrideConfig(configPath, args) {
  if (args.config !== undefined) return null;
  return createRestoredUserOverrideConfig(configPath);
}
