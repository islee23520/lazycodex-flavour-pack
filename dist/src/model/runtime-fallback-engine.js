import { readFileSync } from "node:fs";
import path from "node:path";
import { getPackageRoot } from "../utils/package-root.js";
let cachedConfig = null;
function loadConfig() {
    if (cachedConfig)
        return cachedConfig;
    const configPath = path.join(getPackageRoot(import.meta.url), "agent-configs", "lfp-runtime-fallback.toml");
    try {
        const text = readFileSync(configPath, "utf8");
        const config = {
            retry_on_errors: [429],
            max_fallback_attempts: 3,
            cooldown_seconds: 30,
            timeout_seconds: 120,
            notify_on_fallback: true
        };
        let inRuntime = false;
        for (const rawLine of text.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#"))
                continue;
            if (line === "[runtime]") {
                inRuntime = true;
                continue;
            }
            if (line.startsWith("[")) {
                inRuntime = false;
                continue;
            }
            if (!inRuntime)
                continue;
            const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
            if (!m)
                continue;
            const [, key, rawValue] = m;
            if (key === "retry_on_errors") {
                const nums = rawValue.match(/\d+/g);
                config.retry_on_errors = nums ? nums.map(Number) : [429];
            }
            else if (key === "max_fallback_attempts" || key === "cooldown_seconds" || key === "timeout_seconds") {
                config[key] = Number(rawValue);
            }
            else if (key === "notify_on_fallback") {
                config.notify_on_fallback = rawValue === "true";
            }
        }
        cachedConfig = config;
        return config;
    }
    catch {
        return null;
    }
}
export function getRuntimeFallbackConfig() {
    return loadConfig();
}
export function shouldRetryOnError(statusCode) {
    const config = loadConfig();
    if (!config)
        return false;
    return config.retry_on_errors.includes(statusCode);
}
export function getRetryGuidance(agentName, statusCode) {
    const config = loadConfig();
    if (!config)
        return { emit: false, guidance: null };
    if (!config.retry_on_errors.includes(statusCode))
        return { emit: false, guidance: null };
    return {
        emit: true,
        guidance: `<lfp-runtime-fallback-guidance>
Agent ${agentName} received HTTP ${statusCode}. Runtime fallback policy: retry up to ${config.max_fallback_attempts} times with ${config.cooldown_seconds}s cooldown. Check the declarative fallback chain for alternative models.
</lfp-runtime-fallback-guidance>`
    };
}
