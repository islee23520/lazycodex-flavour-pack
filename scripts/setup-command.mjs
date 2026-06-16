import path from "node:path";
import { createInterface } from "node:readline";

import { configureAgentModelOverrides } from "./agent-model-config.mjs";
import { getCodexAppsToolCacheState } from "./codex-apps-cache.mjs";
import { getPendingCodexPluginActions, installCodexPlugin, PLUGIN_REF } from "./codex-plugin-install.mjs";
import { formatLazyCodexInstallCommand, runLazyCodexInstall } from "./lazycodex-install.mjs";
import { promptForYesNo } from "./model-config-prompts.mjs";
import { resolveProviderOverride, shouldInstallOpenAiCompatProvider } from "./setup-provider.mjs";
import {
  printCodexAppsCacheQuarantine,
  printInstallSmokeState,
  printOpenAiCompatProviderState,
  printAgentModelDrift,
  printApplierPreservationStatus,
  printProviderInventoryVisibility
} from "./cli-reporting.mjs";
import { runSetupTui, shouldUseSetupTui } from "./setup-tui.mjs";
import { syncAgentOverrides, syncGlobalModelDefaults } from "./sync-agent-overrides.mjs";
import {
  createRestoredUserOverrideConfig,
  hasSavedUserOverrideConfig,
  migrateLegacyUserOverrideConfig,
  restoreSavedUserOverrideConfigIfPresent
} from "./user-model-overrides.mjs";

export const GITHUB_START_TARGETS = [
  {
    id: "lazycodex-ai",
    label: "LazyCodex AI",
    repo: "sisyphuslabs/lazycodex-ai",
    url: "https://github.com/sisyphuslabs/lazycodex-ai"
  },
  {
    id: "omo",
    label: "OMO",
    repo: "sisyphuslabs/omo",
    url: "https://github.com/sisyphuslabs/omo"
  },
  {
    id: "lfp",
    label: "LFP",
    repo: "islee23520/lazycodex-flavour-pack",
    url: "https://github.com/islee23520/lazycodex-flavour-pack"
  }
];

export async function runSetup(args, { check, root, defaultConfig }) {
  const context = { check, root, defaultConfig };
  if (shouldUseSetupTui(args, { check, input: process.stdin, output: process.stdout })) {
    await runSetupTui(args, context, { runLineSetup: runSetupLineMode });
    return;
  }

  await runSetupLineMode(args, context);
}

export async function runSetupLineMode(args, { check, root, defaultConfig }, options = {}) {
  let configPath = args.config ?? defaultConfig;

  if (args.skipLazycodexInstall) {
    console.log(`${check ? "would skip" : "lfp setup: skipping"} LazyCodex install; using local LFP checkout files.`);
  } else if (check) {
    console.log(`would run ${formatLazyCodexInstallCommand()} before applying LFP`);
  } else {
    runLazyCodexInstall();
  }

  let providerOverride = resolveProviderOverride(args, options);
  const basePending = getPendingCodexPluginActions({ providerConfig: providerOverride ?? undefined });
  const consentResult = check ? false : await shouldInstallOpenAiCompatProvider(basePending.state, options, providerOverride);
  if (consentResult && typeof consentResult === "object" && consentResult.providerOverride) {
    providerOverride = consentResult.providerOverride;
  }
  const installOpenAiCompatProvider = !!consentResult;
  const pending = getPendingCodexPluginActions({ installOpenAiCompatProvider, providerConfig: providerOverride ?? undefined });
  const effectiveConfig = check ? getEffectiveReadOnlyOverrideConfig(configPath, args) : null;
  let pendingOverrides;
  try {
    pendingOverrides = syncAgentOverrides(effectiveConfig?.configPath ?? configPath, {
      check: true,
      allowMissingLfpOwnedAgents: true
    });
  } catch (error) {
    effectiveConfig?.cleanup();
    throw error;
  }

  if (check) {
    printPendingSetupActions(pending);
    await printProviderInventoryVisibility({ commandName: "dry-setup" });
    printApplierPreservationStatus({ commandName: "dry-setup", syncGlobalDefaults: args.syncGlobalDefaults });
    printAgentModelDrift(effectiveConfig?.configPath ?? configPath, { commandName: "dry-setup" });
  } else {
    const installedPath = await installAndMaybePrompt(args, root, configPath, installOpenAiCompatProvider, pending, options, providerOverride);
    if (installedPath === null) return;
    configPath = installedPath;
  }

  const effectiveConfigPath = effectiveConfig?.configPath ?? configPath;
  const result = check ? pendingOverrides : syncAgentOverrides(configPath, { check: false });
  const globalResult = syncGlobalDefaults(effectiveConfigPath, check, args);
  effectiveConfig?.cleanup();
  printSetupChanges(result, globalResult, check);

  if (check) {
    const appCacheState = getCodexAppsToolCacheState();
    if (pending.actions.length > 0 || result.changed.length > 0 || appCacheState.duplicateFiles.length > 0) {
      process.exitCode = 1;
    }
  }
}

async function installAndMaybePrompt(args, root, configPath, installOpenAiCompatProvider, pending, options = {}, providerOverride = null) {
  printCodexAppsCacheQuarantine();

  if (pending.state.openAiCompatProvider.status === "drifted") {
    printOpenAiCompatProviderState(pending.state);
    process.exitCode = 1;
    return null;
  }

  const installed = installCodexPlugin(root, { installOpenAiCompatProvider, providerConfig: providerOverride ?? undefined });
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

  if (!args.skipModelPrompt && process.stdin.isTTY) await maybePromptModelOverrides(args, installedConfigPath, {
    modelSelector: options.modelSelector,
    tierSelector: options.tierSelector,
    reasoningSelector: options.reasoningSelector,
    yesNoSelector: options.yesNoSelector
  });
  if (process.stdin.isTTY) await maybePromptGitHubStart({ gitHubStartSelector: options.gitHubStartSelector });

  return installedConfigPath;
}

export async function maybePromptModelOverrides(args, configPath, options = {}) {
  const userConfigPath = migrateLegacyUserOverrideConfig(options);
  const hasSavedOverrides = hasSavedUserOverrideConfig(userConfigPath);
  const shouldPromptModelOverrides = hasSavedOverrides || args.config === undefined;
  if (!shouldPromptModelOverrides) return;

  const rl = options.readline ?? createInterface({ input: process.stdin, output: process.stdout });
  const output = options.output ?? console;
  try {
    if (!hasSavedOverrides) {
      const shouldEdit = await promptForYesNo(
        rl,
        "Edit agent model overrides now? Existing configured values will be applied if you press Enter. [y/N]: ",
        { yesNoSelector: options.yesNoSelector }
      );
      if (!shouldEdit) {
        output.log("Keeping configured OMO model override values.");
        return;
      }
    }

    await configureAgentModelOverrides(configPath, {
      readline: rl,
      output,
      recommendModels: true,
      confirmConfiguredValues: true,
      modelSelector: options.modelSelector,
      tierSelector: options.tierSelector,
      reasoningSelector: options.reasoningSelector,
      yesNoSelector: options.yesNoSelector
    });
  } finally {
    if (!options.readline) rl.close();
  }
}

async function maybePromptGitHubStart(options = {}) {
  const output = options.output ?? console;
  if (typeof options.gitHubStartSelector === "function") {
    const target = await options.gitHubStartSelector();
    if (target === null) return null;

    output.log(`GitHub start: ${target.url}`);
    return target;
  }

  const rl = options.readline ?? createInterface({ input: process.stdin, output: process.stdout });

  try {
    output.log("GitHub start targets:");
    for (const [index, target] of GITHUB_START_TARGETS.entries()) {
      output.log(`  ${index + 1}. ${target.label} (${target.repo})`);
    }

    const answer = await prompt(rl, "Start GitHub work from which repo? [1/2/3, Enter to skip]: ");
    const target = selectGitHubStartTarget(answer);
    if (target === null) return null;

    output.log(`GitHub start: ${target.url}`);
    return target;
  } finally {
    if (!options.readline) rl.close();
  }
}

export function selectGitHubStartTarget(answer) {
  const value = String(answer ?? "").trim().toLowerCase();
  if (value.length === 0 || ["n", "no", "skip"].includes(value)) return null;

  if (/^[0-9]+$/.test(value)) return GITHUB_START_TARGETS[Number(value) - 1] ?? null;
  return GITHUB_START_TARGETS.find((target) => {
    return value === target.id || value === target.repo.toLowerCase() || value === target.label.toLowerCase();
  }) ?? null;
}

function printPendingSetupActions(pending) {
  for (const action of pending.actions) console.log(`would ${action}`);
  const appCacheState = getCodexAppsToolCacheState();
  for (const item of appCacheState.duplicateFiles) {
    console.log(`would quarantine duplicate Codex Apps tool cache ${item.filePath} (${item.duplicateToolNames.join(", ")})`);
  }
}

function syncGlobalDefaults(configPath, check, args) {
  if (!shouldSyncGlobalDefaults(args)) return { changed: [], preserved: true };

  try {
    return { ...syncGlobalModelDefaults(configPath, { check }), preserved: false };
  } catch (error) {
    if (!check) console.error(`lfp setup: failed to apply global model defaults: ${error.message}`);
    return { changed: [], preserved: false, error };
  }
}

function shouldSyncGlobalDefaults(args) {
  return args.syncGlobalDefaults === true;
}

function printSetupChanges(result, globalResult, check) {
  for (const item of result.changed) console.log(`${check ? "would update" : "updated"} ${item}`);
  if (globalResult?.preserved) {
    if (check) console.log("global defaults: preserved (agent-only mode)");
    return;
  }

  for (const item of globalResult?.changed ?? []) {
    console.log(`${check ? "would update global model defaults in" : "updated global model defaults in"} ${item}`);
  }
}

function getEffectiveReadOnlyOverrideConfig(configPath, args) {
  if (args.config !== undefined) return null;
  return createRestoredUserOverrideConfig(configPath);
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}
