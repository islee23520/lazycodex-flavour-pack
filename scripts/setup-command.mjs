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

export const GITHUB_START_TARGETS = [
  {
    id: "lazycodex-ai",
    label: "LazyCodex AI",
    repo: "islee23520/lazycodex-ai",
    url: "https://github.com/islee23520/lazycodex-ai"
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

  const basePending = getPendingCodexPluginActions();
  const installOpenAiCompatProvider = check ? false : await shouldInstallOpenAiCompatProvider(basePending.state, options);
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
    const installedPath = await installAndMaybePrompt(args, root, configPath, installOpenAiCompatProvider, pending, options);
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

async function installAndMaybePrompt(args, root, configPath, installOpenAiCompatProvider, pending, options = {}) {
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

  if (!args.skipArtPrompt && process.stdin.isTTY) await configureArtTeamIfWanted({
    modelSelector: options.modelSelector,
    tierSelector: options.tierSelector,
    reasoningSelector: options.reasoningSelector
  });
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
        "Edit OMO agent model overrides now? Existing configured values will be applied if you press Enter. [y/N]: ",
        { yesNoSelector: selectorOptions.yesNoSelector }
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

async function shouldInstallOpenAiCompatProvider(state, selectorOptions = {}) {
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
      `Install OpenAI-compatible model provider ${state.openAiCompatProvider.id} in ${state.configPath}? [y/N]: `,
      { yesNoSelector: selectorOptions.yesNoSelector }
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

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}
