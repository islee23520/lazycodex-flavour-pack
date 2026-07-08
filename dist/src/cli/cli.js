import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { maybeConfigureOpenCodexSisyphus } from "../codex/sisyphus-main-routing.js";
import { getCodexPluginState, PLUGIN_REF } from "../install/codex-plugin-install.js";
import { formatLazyCodexInstallCommand, runLazyCodexInstall } from "../install/lazycodex-install.js";
import { runSetup } from "../install/setup-command.js";
import { configureAgentModelOverrides } from "../model/agent-model-config.js";
import { runBenchmarkCommand } from "../model/model-benchmark.js";
import { syncAgentOverrides, syncGlobalModelDefaults } from "../model/sync-agent-overrides.js";
import { createRestoredUserOverrideConfig, getUserOverrideConfigPath } from "../model/user-model-overrides.js";
import { runSkillManagerCommand, SkillManagerUsageError } from "../skills/skill-manager.js";
import { getPackageRoot } from "../utils/package-root.js";
import { XaiAuthUsageError } from "../xai/xai-auth.js";
import { parseDoctorArgs, parseSyncArgs } from "./cli-args.js";
import { printAgentModelDrift, printApplierPreservationStatus, printCodexAppsCacheFixApply, printCodexAppsCacheFixPreview, printCodexAppsCacheState, printInstallSmokeState, printOpenAiCompatProviderState, printProviderInventoryVisibility, printRolePolicyConfig, printXaiMcpPluginStatus } from "./cli-reporting.js";
import { runDelete } from "./delete-command.js";
import { dispatchXaiAuthCommand } from "./xai-auth-command.js";
const ROOT = getPackageRoot(import.meta.url);
const DEFAULT_CONFIG = path.join(ROOT, "agent-configs", "omo-agent-model-overrides.toml");
const HELP = `lfp

Usage:
  lfp setup [--config <path>] [--agent-models-only|--sync-global-defaults] [--skip-model-prompt] [--no-tui]
  lfp dry-setup [--config <path>] [--agent-models-only|--sync-global-defaults]
  lfp delete [--check]
  lfp doctor [--config <path>] [--fix-cache [--apply]]
  lfp sync [--config <path>] [--check] [--skip-lazycodex-install]
  lfp agent-config [--config <path>] [--agent-models-only|--sync-global-defaults]
  lfp benchmark-models [--recommend-only] [--roles <csv>] [--models <csv>] [--samples <n>] [--output <path>] [--dry-run] [--apply]
  lfp skill-manager [--check|--apply] [--json]
  lfp xai auth [status|set-api-key|import-grok|refresh|logout] [--api-key <key>] [--json]
  lfp help

npx:
  npx @islee23520/lfp@latest setup
  npx @islee23520/lfp@latest dry-setup
  npx @islee23520/lfp@latest delete
  npx @islee23520/lfp@latest doctor
  npx @islee23520/lfp@latest sync
  npx @islee23520/lfp@latest agent-config
  npx @islee23520/lfp@latest benchmark-models
  npx @islee23520/lfp@latest skill-manager
  npx @islee23520/lfp@latest xai auth status

Commands:
  setup            Install LFP plugin and saved model config into Codex.
                   Interactive: opens the model guide by default, including Default Codex, ULW, and OMO/LazyCodex agents.
                   TUI options mark current values and vanilla LazyCodex defaults.
                   Press Enter to keep the shown value; choose Back or type back in line mode to revisit the previous setting.
                   If provider models are discoverable, setup auto-generates recommendations while
                   Enter keeps each configured agent value.
  dry-setup        Preview what setup would do without writing.
  delete           Remove installed LFP plugin files and LFP config tables.
  doctor           Check LFP install status, saved config, agent models, and overrides.
  sync             Update LazyCodex, optionally configure OpenCodex when missing, make Sisyphus the
                   OMO main route on opencodex zai/glm-5.2[1m], and apply ~/.codex/lfp.json model settings.
  agent-config     Reconfigure ~/.codex/lfp.json model settings and apply supported OMO/LazyCodex agent model fields.
  benchmark-models Recommend or benchmark role-based model routing against the active OpenAI-compatible provider.
  skill-manager    Audit local skill folders, report invalid skills, and optionally move them to skills.disabled.
  xai auth         Manage dedicated LFP xAI credentials under CODEX_HOME/xai-oauth without registering MCP servers.
  help             Show this help.

Flags:
  --config <path>  Use a specific override config file instead of the packaged defaults or ~/.codex/lfp.json.
  --fix-cache  Check duplicate Codex Apps tool cache files.
  --apply  With doctor --fix-cache, quarantine duplicate cache files.
  --check  With delete, preview delete actions without writing.
  --skip-model-prompt  Skip the interactive LFP model prompt during setup.
  --skip-lazycodex-install  Local development only: install this checkout without running LazyCodex install first.
  --no-tui  Force legacy line-output setup even when running in an interactive terminal.
  --agent-models-only  Apply only installed agent TOMLs; do NOT sync default and ULW models into Codex config.toml.
  --sync-global-defaults  Also sync default and ULW models into Codex config.toml. This is the default behavior.
  --roles  With benchmark-models, comma-separated role names to test.
  --models  With benchmark-models, comma-separated model ids to test.
  --samples  With benchmark-models, repeated samples per role/model.
  --output  With benchmark-models, JSON result path under .omo/benchmark-results by default.
  --recommend-only  With benchmark-models, use prebenchmarked family routing over active /v1/models without completion calls.
  --dry-run  With benchmark-models, score scenarios without provider calls.
  --apply  With benchmark-models, write winning model fields to ~/.codex/lfp.json.
  --check  With skill-manager, preview planned skill moves without writing (default).
  --apply  With skill-manager, move invalid skills to matching skills.disabled roots and write a receipt.
  --json   With skill-manager or xai auth, emit machine-readable JSON on stdout.
  --api-key  With xai auth set-api-key, provide the xAI API key non-interactively.

  This package extends LazyCodex with model/provider setup, OMO model-routing guidance, fallback lookup, and benchmark capabilities for Codex. setup runs npx lazycodex-ai@latest install before applying LFP, installs/enables this pack in Codex, writes canonical schemaVersion 2 config to ~/.codex/lfp.json, and applies configured three primary model fields to existing OMO/LazyCodex agent TOMLs. Use --agent-models-only to preserve existing Codex global defaults.`;
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
    if (command === "delete") {
        runDelete(args);
        return;
    }
    if (command === "doctor") {
        await runDoctor(args);
        return;
    }
    if (command === "sync") {
        await runSync(args);
        return;
    }
    if (command === "agent-config") {
        await runAgentConfig(args);
        return;
    }
    if (command === "benchmark-models") {
        const result = await runBenchmarkCommand(args, { output: console });
        if (result.applied.length > 0)
            console.log("global defaults: preserved (agent-only mode)");
        return;
    }
    if (command === "skill-manager") {
        try {
            runSkillManagerCommand(args, { output: console });
        }
        catch (error) {
            if (error instanceof SkillManagerUsageError) {
                console.error(error.message);
                process.exitCode = error.exitCode;
                return;
            }
            throw error;
        }
        return;
    }
    if (command === "xai") {
        if (args[0] !== "auth") {
            console.error('Expected subcommand "auth"');
            process.exitCode = 2;
            return;
        }
        try {
            const result = await dispatchXaiAuthCommand(args.slice(1), { env: process.env });
            if (typeof result === "string")
                console.log(result);
            else
                console.log(JSON.stringify(result, null, 2));
        }
        catch (error) {
            if (error instanceof XaiAuthUsageError) {
                console.error(error.message);
                process.exitCode = error.exitCode;
                return;
            }
            throw error;
        }
        return;
    }
    throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}
async function runDoctor(argv) {
    const args = parseDoctorArgs(argv);
    if (args.check !== undefined)
        throw new Error("doctor does not accept --check; use dry-setup instead");
    if (args.apply && !args.fixCache)
        throw new Error("doctor --apply requires --fix-cache");
    const state = getCodexPluginState();
    const configPath = args.config ??
        (state.pluginFilesInstalled
            ? path.join(state.pluginRoot, "agent-configs", "omo-agent-model-overrides.toml")
            : DEFAULT_CONFIG);
    const effectiveConfig = getEffectiveReadOnlyOverrideConfig(configPath, args);
    let hasIssue = false;
    console.log(`lfp doctor: Codex home: ${state.codexHome}`);
    console.log(`lfp doctor: plugin files: ${state.pluginFilesInstalled ? "installed" : "missing"} (${state.pluginRoot})`);
    console.log(`lfp doctor: marketplace config: ${state.marketplaceConfigured ? "configured" : "missing"} (${state.configPath})`);
    console.log(`lfp doctor: plugin config: ${state.pluginEnabled ? "enabled" : "missing"} (${PLUGIN_REF})`);
    console.log(`lfp doctor: LFP-owned agents: ${state.additionalAgentsInstalled ? "installed" : "missing"} (oracle, prometheus, hephaestus, atlas, sisyphus-junior)`);
    hasIssue ||= !state.pluginFilesInstalled || !state.marketplaceConfigured || !state.pluginEnabled;
    hasIssue ||= !state.additionalAgentsInstalled;
    printOpenAiCompatProviderState(state);
    hasIssue ||= state.openAiCompatProvider.status === "drifted";
    await printProviderInventoryVisibility({ commandName: "doctor" });
    printApplierPreservationStatus({ commandName: "doctor" });
    printRolePolicyConfig({ commandName: "doctor" });
    const installSmokeOk = printInstallSmokeState();
    hasIssue ||= !installSmokeOk;
    try {
        const { getAllCategories } = await import("../model/category-resolver.js");
        const categories = getAllCategories();
        console.log(`lfp doctor: categories: configured (${categories.length})`);
    }
    catch {
        console.log("lfp doctor: categories: missing");
        hasIssue = true;
    }
    try {
        const { getRuntimeFallbackConfig } = await import("../model/runtime-fallback-engine.js");
        const config = getRuntimeFallbackConfig();
        if (config) {
            console.log("lfp doctor: runtime fallback: configured");
        }
        else {
            console.log("lfp doctor: runtime fallback: missing");
        }
    }
    catch {
        console.log("lfp doctor: runtime fallback: missing");
        hasIssue = true;
    }
    printXaiMcpPluginStatus();
    const appCacheOk = printDoctorCodexAppsCacheState(args);
    hasIssue ||= !appCacheOk;
    try {
        const effectiveConfigPath = effectiveConfig?.configPath ?? configPath;
        const driftResult = printAgentModelDrift(effectiveConfigPath, { commandName: "doctor" });
        hasIssue ||= !driftResult.ok;
        const result = syncAgentOverrides(effectiveConfigPath, { check: true });
        if (result.changed.length === 0) {
            console.log("lfp doctor: agent overrides: already applied");
        }
        else {
            console.log("lfp doctor: agent overrides: setup would update:");
            for (const item of result.changed)
                console.log(`would update ${item}`);
        }
    }
    catch (error) {
        hasIssue = true;
        console.log(`lfp doctor: LazyCodex/OMO: ${error instanceof Error ? error.message : String(error)}`);
    }
    finally {
        effectiveConfig?.cleanup();
    }
    if (hasIssue)
        process.exitCode = 1;
}
function printDoctorCodexAppsCacheState(args) {
    if (!args.fixCache)
        return printCodexAppsCacheState();
    if (args.apply)
        return printCodexAppsCacheFixApply();
    return printCodexAppsCacheFixPreview();
}
function getEffectiveReadOnlyOverrideConfig(configPath, args) {
    if (args.config !== undefined)
        return null;
    return createRestoredUserOverrideConfig(configPath);
}
async function runSync(argv) {
    const args = parseSyncArgs(argv);
    if (args.skipLazycodexInstall) {
        console.log(`${args.check ? "would skip" : "lfp sync: skipping"} LazyCodex install; using current install.`);
    }
    else if (args.check) {
        console.log(`would run ${formatLazyCodexInstallCommand()} before syncing LFP`);
    }
    else {
        runLazyCodexInstall();
    }
    const routingResult = await maybeConfigureOpenCodexSisyphus({ check: args.check, output: console });
    for (const item of routingResult.changed) {
        console.log(`${args.check ? "would update Sisyphus main routing in" : "updated Sisyphus main routing in"} ${item}`);
    }
    if (routingResult.changed.length === 0)
        console.log("Sisyphus main routing already applied");
    const configPath = args.config ?? getUserOverrideConfigPath();
    const result = syncAgentOverrides(configPath, { check: args.check });
    for (const item of result.changed)
        console.log(`${args.check ? "would update" : "updated"} ${item}`);
    if (result.changed.length === 0)
        console.log("agent overrides already applied");
    if (args.check && result.changed.length > 0)
        process.exitCode = 1;
}
async function runAgentConfig(argv) {
    const args = parseSyncArgs(argv);
    const configPath = args.config ?? getDefaultInstalledOverrideConfigPath();
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        console.log("Reconfiguring LFP model settings...\n");
        if (process.stdin.isTTY) {
            await configureAgentModelOverrides(configPath, { readline: rl, output: console });
        }
        else {
            await configureAgentModelOverrides(configPath, { interactive: false });
            console.log("agent-config: non-interactive; applying configured values.");
        }
    }
    finally {
        rl.close();
    }
    const result = syncAgentOverrides(configPath, { check: false });
    for (const item of result.changed)
        console.log(`updated ${item}`);
    if (result.changed.length === 0)
        console.log("agent overrides already applied");
    if (args.agentModelsOnly !== true) {
        const globalResult = syncGlobalModelDefaults(configPath, { check: false });
        for (const item of globalResult.changed)
            console.log(`updated global model defaults in ${item}`);
    }
    else {
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
    if (process.argv[1] === undefined)
        return false;
    return (import.meta.url === pathToFileURL(process.argv[1]).href ||
        ["cli.mjs", "lfp"].includes(path.basename(process.argv[1])));
}
