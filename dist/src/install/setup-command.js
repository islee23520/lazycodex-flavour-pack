import path from "node:path";
import { createInterface } from "node:readline";
import { printAgentModelDrift, printApplierPreservationStatus, printCodexAppsCacheQuarantine, printInstallSmokeState, printOpenAiCompatProviderState, printProviderInventoryVisibility } from "../cli/cli-reporting.js";
import { getCodexAppsToolCacheState } from "../codex/codex-apps-cache.js";
import { maybeConfigureOpenCodexSisyphus } from "../codex/sisyphus-main-routing.js";
import { configureAgentModelOverrides } from "../model/agent-model-config.js";
import { fetchAvailableModels } from "../model/model-provider.js";
import { buildRecommendedModelOverrides } from "../model/model-recommendations.js";
import { readOverrideConfig, syncAgentOverrides, syncGlobalModelDefaults } from "../model/sync-agent-overrides.js";
import { createRestoredUserOverrideConfig, hasSavedUserOverrideConfig, migrateLegacyUserOverrideConfig, restoreSavedUserOverrideConfigIfPresent, saveUserOverrideConfig } from "../model/user-model-overrides.js";
import { resolveProviderOverride, shouldInstallOpenAiCompatProvider } from "../provider/setup-provider.js";
import { runSetupTui, shouldUseSetupTui } from "../tui/setup-tui.js";
import { getPendingCodexPluginActions, installCodexPlugin, PLUGIN_REF } from "./codex-plugin-install.js";
import { formatLazyCodexInstallCommand, runLazyCodexInstall } from "./lazycodex-install.js";
import { maybePromptGitHubStart } from "./setup-command-github.js";
import { maybePromptXaiMcpPlugin } from "./xai-mcp-plugin.js";
export { GITHUB_START_TARGETS, selectGitHubStartTarget } from "./setup-command-github.js";
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
    }
    else if (check) {
        console.log(`would run ${formatLazyCodexInstallCommand()} before applying LFP`);
    }
    else {
        runLazyCodexInstall();
    }
    await maybeConfigureOpenCodexSisyphus({ check, ...options, output: options.output ?? console });
    let providerOverride = resolveProviderOverride(args, options);
    const basePending = getPendingCodexPluginActions({ providerConfig: providerOverride ?? undefined });
    const consentResult = check
        ? false
        : await shouldInstallOpenAiCompatProvider(basePending.state, options, providerOverride);
    if (consentResult && typeof consentResult === "object" && consentResult.providerOverride) {
        providerOverride = consentResult.providerOverride;
    }
    const installOpenAiCompatProvider = !!consentResult;
    const pending = getPendingCodexPluginActions({
        installOpenAiCompatProvider,
        providerConfig: providerOverride ?? undefined
    });
    const effectiveConfig = check ? getEffectiveReadOnlyOverrideConfig(configPath, args) : null;
    let pendingOverrides;
    try {
        pendingOverrides = syncAgentOverrides(effectiveConfig?.configPath ?? configPath, {
            check: true,
            allowMissingLfpOwnedAgents: true
        });
    }
    catch (error) {
        effectiveConfig?.cleanup();
        throw error;
    }
    if (check) {
        printPendingSetupActions(pending);
        await printProviderInventoryVisibility({ commandName: "dry-setup" });
        printApplierPreservationStatus({ commandName: "dry-setup", agentModelsOnly: args.agentModelsOnly });
        printAgentModelDrift(effectiveConfig?.configPath ?? configPath, { commandName: "dry-setup" });
    }
    else {
        const installedPath = await installAndMaybePrompt(args, root, configPath, installOpenAiCompatProvider, pending, options, providerOverride);
        if (installedPath === null)
            return;
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
    const installed = installCodexPlugin(root, {
        installOpenAiCompatProvider,
        providerConfig: providerOverride ?? undefined
    });
    const installedConfigPath = args.config === undefined
        ? path.join(installed.pluginRoot, "agent-configs", "omo-agent-model-overrides.toml")
        : configPath;
    let effectiveConfigPath = installedConfigPath;
    if (args.config === undefined && (args.skipModelPrompt || !process.stdin.isTTY)) {
        effectiveConfigPath = await prepareNonInteractiveOverrideConfig(installedConfigPath, options);
    }
    console.log(`installed ${PLUGIN_REF} to ${installed.pluginRoot}`);
    console.log(`enabled ${PLUGIN_REF} in ${installed.configPath}`);
    printOpenAiCompatProviderState(installed);
    printInstallSmokeState();
    if (!args.skipModelPrompt && process.stdin.isTTY)
        await maybePromptModelOverrides(args, installedConfigPath, {
            modelSelector: options.modelSelector,
            tierSelector: options.tierSelector,
            reasoningSelector: options.reasoningSelector,
            yesNoSelector: options.yesNoSelector,
            output: options.output,
            models: options.models,
            env: options.env,
            userOverrideConfigPath: options.userOverrideConfigPath,
            persistUserOverrides: options.persistUserOverrides
        });
    if (process.stdin.isTTY)
        await maybePromptGitHubStart({ gitHubStartSelector: options.gitHubStartSelector });
    await maybePromptXaiMcpPlugin({
        skipXaiMcp: args.skipXaiMcp,
        env: options.env,
        yesNoSelector: options.yesNoSelector,
        readline: options.readline
    });
    return effectiveConfigPath;
}
async function prepareNonInteractiveOverrideConfig(installedConfigPath, options = {}) {
    const userConfigPath = migrateLegacyUserOverrideConfig(options);
    if (hasSavedUserOverrideConfig(userConfigPath)) {
        const restoredPath = restoreSavedUserOverrideConfigIfPresent(installedConfigPath, options);
        if (restoredPath !== null)
            console.log(`applied saved LFP model override config from ${restoredPath} (non-interactive)`);
        return installedConfigPath;
    }
    const models = await safeFetchSetupModels({ ...options, output: options.output ?? console });
    const seedConfig = readOverrideConfig(installedConfigPath, options);
    const recommended = { ...(seedConfig.overrides ?? {}) };
    if (models.length > 0) {
        const recommendations = buildRecommendedModelOverrides(seedConfig.overrides ?? {}, models, {
            ...options,
            env: options.env ?? process.env
        });
        for (const [agent, fields] of Object.entries(recommendations)) {
            recommended[agent] = { ...(recommended[agent] ?? {}), ...fields };
        }
    }
    saveUserOverrideConfig(userConfigPath, {
        schemaVersion: 2,
        source: { agentsDir: "${CODEX_HOME}/agents" },
        overrides: recommended,
        rolePolicies: {}
    });
    console.log(`wrote recommended models to ${userConfigPath}`);
    return userConfigPath;
}
export async function maybePromptModelOverrides(args, configPath, options = {}) {
    const userConfigPath = migrateLegacyUserOverrideConfig(options);
    const hasSavedOverrides = hasSavedUserOverrideConfig(userConfigPath);
    const shouldPromptModelOverrides = hasSavedOverrides || args.config === undefined;
    if (!shouldPromptModelOverrides)
        return;
    const rl = options.readline ?? createInterface({ input: process.stdin, output: process.stdout });
    const output = options.output ?? console;
    const models = options.models ?? (await safeFetchSetupModels(options));
    if (models.length > 0)
        printSetupModelRecommendations(configPath, models, output, options);
    try {
        if (!hasSavedOverrides) {
            output.log("Showing default OMO/LazyCodex model guide. Press Enter to keep each shown value.");
            output.log("");
        }
        await configureAgentModelOverrides(configPath, {
            readline: rl,
            output,
            recommendModels: true,
            models,
            confirmConfiguredValues: true,
            modelSelector: options.modelSelector,
            tierSelector: options.tierSelector,
            reasoningSelector: options.reasoningSelector,
            yesNoSelector: options.yesNoSelector,
            env: options.env,
            userOverrideConfigPath: options.userOverrideConfigPath,
            persistUserOverrides: options.persistUserOverrides
        });
    }
    finally {
        if (!options.readline)
            rl.close();
    }
}
async function safeFetchSetupModels(options) {
    try {
        return await fetchAvailableModels(options);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        options.output?.log?.(`Could not discover available models for recommendations: ${message}`);
        return [];
    }
}
function printSetupModelRecommendations(configPath, models, output, options) {
    const config = readOverrideConfig(configPath, options);
    const recommendations = buildRecommendedModelOverrides(config.overrides ?? {}, models, options);
    const entries = Object.entries(recommendations).filter(([, fields]) => typeof fields.model === "string");
    if (entries.length === 0)
        return;
    output.log("LFP model recommendations from the active provider:");
    for (const [agentName, fields] of entries) {
        const current = config.overrides?.[agentName] ?? {};
        output.log(`  ${agentName}: ${fields.model} (reasoning: ${fields.model_reasoning_effort ?? "N/A"}, tier: ${fields.service_tier ?? "default"}) from current ${current.model ?? "unset"}`);
    }
    output.log("");
}
function printPendingSetupActions(pending) {
    for (const action of pending.actions)
        console.log(`would ${action}`);
    const appCacheState = getCodexAppsToolCacheState();
    for (const item of appCacheState.duplicateFiles) {
        console.log(`would quarantine duplicate Codex Apps tool cache ${item.filePath} (${item.duplicateToolNames.join(", ")})`);
    }
}
function syncGlobalDefaults(configPath, check, args) {
    if (!shouldSyncGlobalDefaults(args))
        return { changed: [], preserved: true };
    try {
        return { ...syncGlobalModelDefaults(configPath, { check }), preserved: false };
    }
    catch (error) {
        if (!check)
            console.error(`lfp setup: failed to apply global model defaults: ${error.message}`);
        return { changed: [], preserved: false, error };
    }
}
function shouldSyncGlobalDefaults(args) {
    // Default: sync global defaults. Opt out with --agent-models-only.
    return args.agentModelsOnly !== true;
}
function printSetupChanges(result, globalResult, check) {
    for (const item of result.changed)
        console.log(`${check ? "would update" : "updated"} ${item}`);
    if (!check && Array.isArray(result.skippedReadOnly) && result.skippedReadOnly.length > 0) {
        console.log("applied model fields to configured OMO/LazyCodex agents");
    }
    if (globalResult?.preserved) {
        if (check)
            console.log("global defaults: preserved (agent-only mode)");
        return;
    }
    for (const item of globalResult?.changed ?? []) {
        console.log(`${check ? "would update global model defaults in" : "updated global model defaults in"} ${item}`);
    }
}
function getEffectiveReadOnlyOverrideConfig(configPath, args) {
    if (args.config !== undefined)
        return null;
    return createRestoredUserOverrideConfig(configPath);
}
