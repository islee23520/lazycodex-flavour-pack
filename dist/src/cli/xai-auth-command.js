import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline";
import { clearXaiAuth, getXaiAuthStatus, importGrokXaiAuth, refreshXaiOAuth, resolveCodexHostAuthPath, resolveGrokHostAuthPath, resolveXaiAuthPath, writeXaiApiKey, XaiAuthUsageError } from "../xai/xai-auth.js";
export async function dispatchXaiAuthCommand(argv, options = {}) {
    const args = parseXaiAuthArgs(argv);
    const action = args.action;
    if (action === "status" || action === "check") {
        const status = getXaiAuthStatus(options);
        const payload = {
            ok: status.ok,
            status: "xai_auth_status",
            mode: status.mode,
            authFile: status.authFile,
            expiresAt: status.expiresAt,
            provider: status.provider,
            message: status.message,
            codexHostAuthPath: resolveCodexHostAuthPath(options),
            codexHostAuthUntouched: true,
            mcpRegistered: false
        };
        return args.json ? payload : formatXaiStatus(payload);
    }
    if (action === "set-api-key" || action === "login") {
        const apiKey = args.apiKey ?? (await promptApiKey());
        if (apiKey === null || apiKey.trim().length === 0) {
            const payload = { ok: false, status: "xai_auth_cancelled", error: "No API key provided" };
            return args.json ? payload : "Cancelled: no API key provided.";
        }
        const authFile = resolveXaiAuthPath(options);
        writeXaiApiKey(authFile, apiKey);
        const payload = {
            ok: true,
            status: "xai_auth_saved",
            mode: "api_key",
            authFile,
            message: "Saved xAI API key to CODEX_HOME/xai-oauth/auth.json. LFP did not register an MCP server."
        };
        return args.json ? payload : `Saved xAI API key to ${authFile}\nLFP did not register an MCP server.`;
    }
    if (action === "import-grok") {
        const result = importGrokXaiAuth(options);
        const payload = {
            ok: result.imported || result.preserved,
            status: result.imported
                ? "xai_auth_imported"
                : result.preserved
                    ? "xai_auth_preserved"
                    : "xai_auth_import_missing",
            mode: result.mode,
            source: result.source,
            authFile: result.targetPath,
            preserved: result.preserved,
            reason: result.reason,
            grokHostAuthPath: resolveGrokHostAuthPath(options),
            grokHostAuthUntouched: true,
            mcpRegistered: false,
            message: result.imported
                ? "Imported xAI credentials from Grok into CODEX_HOME/xai-oauth/auth.json."
                : result.preserved
                    ? "Preserved existing valid LFP xAI credentials; Grok credentials are expired."
                    : "No importable xAI credentials found in Grok auth files."
        };
        return args.json ? payload : formatImportResult(payload);
    }
    if (action === "refresh") {
        const result = await refreshXaiOAuth(options);
        const payload = {
            ok: true,
            status: result.refreshed ? "xai_auth_refreshed" : "xai_auth_refresh_skipped",
            mode: result.mode,
            authFile: result.authFile,
            expiresAt: result.expiresAt,
            mcpRegistered: false,
            message: result.refreshed
                ? "Refreshed xAI OAuth credentials."
                : result.mode === "api_key"
                    ? "xAI auth uses an API key; refresh skipped."
                    : "xAI OAuth credentials are still valid; refresh skipped."
        };
        return args.json ? payload : formatRefreshResult(payload);
    }
    if (action === "logout" || action === "clear") {
        const authFile = resolveXaiAuthPath(options);
        const removed = clearXaiAuth(authFile);
        const payload = {
            ok: true,
            status: "xai_auth_cleared",
            authFile,
            removed,
            message: removed
                ? "Removed dedicated xAI credentials. Codex auth.json was not modified."
                : "No dedicated xAI credentials to remove. Codex auth.json was not modified."
        };
        return args.json ? payload : payload.message;
    }
    throw new XaiAuthUsageError(`Unknown xai auth action: ${action}`);
}
export function parseXaiAuthArgs(argv) {
    const parsed = { action: "status", apiKey: null, json: false };
    const items = [...argv];
    if (items[0] !== undefined && !items[0].startsWith("-")) {
        parsed.action = items.shift() ?? "status";
    }
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === "--json") {
            parsed.json = true;
            continue;
        }
        if (item === "--api-key") {
            const value = items[index + 1];
            if (value === undefined || value.startsWith("-"))
                throw new XaiAuthUsageError("--api-key requires a value");
            parsed.apiKey = value;
            index += 1;
            continue;
        }
        throw new XaiAuthUsageError(`Unknown xai auth option: ${item}`);
    }
    return parsed;
}
function formatXaiStatus(payload) {
    return [
        "xAI authentication (LFP)",
        `  dedicated file: ${payload.authFile}`,
        `  mode: ${payload.mode}`,
        `  ok: ${payload.ok}`,
        payload.expiresAt === null ? "" : `  expires: ${payload.expiresAt}`,
        `  ${payload.message}`,
        "",
        `Codex host auth: ${payload.codexHostAuthPath}`,
        "Codex host auth.json is never modified by LFP xAI auth.",
        "MCP registration: not installed by LFP.",
        "Configure: lfp xai auth set-api-key --api-key <key>   Import: lfp xai auth import-grok   Refresh: lfp xai auth refresh   Clear: lfp xai auth logout"
    ]
        .filter((line) => line.length > 0)
        .join("\n");
}
function formatRefreshResult(payload) {
    return [
        payload.message,
        `Auth file: ${payload.authFile}`,
        payload.expiresAt === null ? "" : `Expires: ${payload.expiresAt}`,
        "MCP registration: not installed by LFP."
    ]
        .filter((line) => line.length > 0)
        .join("\n");
}
function formatImportResult(payload) {
    if (!payload.ok) {
        return [
            "No importable xAI credentials found in Grok auth files.",
            `Checked Grok host auth: ${payload.grokHostAuthPath}`,
            `Target auth file: ${payload.authFile}`
        ].join("\n");
    }
    return [
        `Imported xAI credentials from ${payload.source}`,
        `Saved to ${payload.authFile}`,
        "Grok host auth.json was not modified.",
        "MCP registration: not installed by LFP."
    ].join("\n");
}
async function promptApiKey() {
    if (!input.isTTY)
        return null;
    const rl = createInterface({ input, output });
    try {
        return await new Promise((resolve) => {
            rl.question("xAI API key (paste and press Enter): ", (answer) => {
                resolve(answer);
            });
        });
    }
    finally {
        rl.close();
    }
}
