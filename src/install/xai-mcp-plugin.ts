import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const LEDGER_DIR = ".ledger";
const XAI_MCP_CONSENT_FILE = "xai-mcp-plugin-consent.json";
const XAI_MCP_PLUGIN_REF = "codex-xai-oauth@linalab";

export function getXaiMcpConsentPath(options = {}) {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  return options.xaiMcpConsentPath ?? path.join(codexHome, LEDGER_DIR, "lfp", XAI_MCP_CONSENT_FILE);
}

export function readXaiMcpConsent(options = {}) {
  const consentPath = getXaiMcpConsentPath(options);
  if (!existsSync(consentPath)) return null;
  const parsed = JSON.parse(readFileSync(consentPath, "utf8"));
  if (parsed.installXaiMcpPlugin === true) return true;
  if (parsed.installXaiMcpPlugin === false) return false;
  return null;
}

export function saveXaiMcpConsent(installXaiMcpPlugin, options = {}) {
  const consentPath = getXaiMcpConsentPath(options);
  mkdirSync(path.dirname(consentPath), { recursive: true });
  writeFileSync(
    consentPath,
    `${JSON.stringify({ installXaiMcpPlugin, recordedAt: new Date().toISOString() }, null, 2)}\n`
  );
  return consentPath;
}

export function getXaiMcpPluginStatus(options = {}) {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  const marketplaceRoot = path.join(codexHome, "local-marketplaces", "linalab");
  const pluginRoot = path.join(marketplaceRoot, "plugins", "codex-xai-oauth");
  const pluginManifest = path.join(pluginRoot, ".codex-plugin", "plugin.json");
  const mcpServerJs = path.join(pluginRoot, "dist", "mcp", "server.js");

  return {
    pluginFilesInstalled: existsSync(pluginManifest),
    mcpServerBuilt: existsSync(mcpServerJs),
    pluginRoot,
    pluginRef: XAI_MCP_PLUGIN_REF
  };
}

export function installXaiMcpPlugin(options = {}) {
  const result = spawnSync("npx", ["codex-xai-oauth@latest", "setup"], {
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    timeout: 120000,
    stdio: "pipe"
  });

  if (result.error) {
    return { success: false, error: String(result.error), stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }
  if (result.status !== 0 && result.status !== null) {
    return {
      success: false,
      error: `npx codex-xai-oauth setup exited ${result.status}`,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    };
  }

  return { success: true, error: null, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function shouldPromptXaiMcpPlugin(options = {}) {
  if (options.skipXaiMcp === true) return false;
  if (options.check === true) return false;
  if (!process.stdin.isTTY) return false;
  return true;
}

export async function maybePromptXaiMcpPlugin(options = {}) {
  if (!shouldPromptXaiMcpPlugin(options)) return null;

  const existingConsent = readXaiMcpConsent(options);
  if (existingConsent !== null) {
    const status = getXaiMcpPluginStatus(options);
    if (existingConsent && !status.pluginFilesInstalled) {
      console.log("lfp setup: xAI MCP plugin consent recorded as yes but plugin not found; reinstalling...");
      const result = installXaiMcpPlugin(options);
      if (result.success) {
        console.log("lfp setup: xAI MCP plugin installed (image generation, TTS, web search, video generation).");
      } else {
        console.log(`lfp setup: xAI MCP plugin install failed: ${result.error}`);
      }
    }
    return existingConsent;
  }

  const readline =
    options.readline ??
    (await import("node:readline")).createInterface({ input: process.stdin, output: process.stdout });
  const yesNoSelector = options.yesNoSelector;

  try {
    let answer;
    if (typeof yesNoSelector === "function") {
      answer = await yesNoSelector({
        question:
          "Install xAI MCP plugin? Adds Grok image generation, TTS, web search, and video tools to Codex. [y/N]: "
      });
    } else {
      answer = await new Promise((resolve) => {
        readline.question(
          "Install xAI MCP plugin? Adds Grok image generation, TTS, web search, and video tools to Codex. [y/N]: ",
          resolve
        );
      });
    }

    const shouldInstall =
      answer === true || (typeof answer === "string" && ["y", "yes"].includes(answer.trim().toLowerCase()));
    const consentPath = saveXaiMcpConsent(shouldInstall, options);
    console.log(`lfp setup: xAI MCP plugin consent recorded as ${shouldInstall ? "yes" : "no"} in ${consentPath}.`);

    if (shouldInstall) {
      console.log("lfp setup: installing xAI MCP plugin (codex-xai-oauth)...");
      const result = installXaiMcpPlugin(options);
      if (result.success) {
        console.log(
          "lfp setup: xAI MCP plugin installed. Use `codex-xai-oauth login` or set XAI_API_KEY to authenticate."
        );
      } else {
        console.log(`lfp setup: xAI MCP plugin install failed: ${result.error}`);
        console.log("lfp setup: you can install it later with: npx codex-xai-oauth setup");
      }
    }

    return shouldInstall;
  } finally {
    if (!options.readline && !options.yesNoSelector) readline.close();
  }
}
