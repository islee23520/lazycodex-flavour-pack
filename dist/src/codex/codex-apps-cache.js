import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const CACHE_DIR = path.join("cache", "codex_apps_tools");
const QUARANTINE_DIR = "quarantine";
export function getCodexAppsToolCacheState(options = {}) {
    const codexHome = getCodexHome(options.env);
    const cacheDir = options.cacheDir ?? path.join(codexHome, CACHE_DIR);
    const files = listJsonFiles(cacheDir);
    const duplicateFiles = [];
    for (const filePath of files) {
        const duplicateToolNames = findDuplicateToolNames(filePath);
        if (duplicateToolNames.length === 0)
            continue;
        duplicateFiles.push({ filePath, duplicateToolNames });
    }
    return {
        cacheDir,
        healthy: duplicateFiles.length === 0,
        duplicateFiles
    };
}
export function quarantineDuplicateCodexAppsToolCaches(options = {}) {
    const state = getCodexAppsToolCacheState(options);
    if (state.duplicateFiles.length === 0)
        return { state, quarantined: [] };
    const quarantineDir = options.quarantineDir ?? path.join(state.cacheDir, QUARANTINE_DIR);
    mkdirSync(quarantineDir, { recursive: true });
    const stamp = toFileStamp(options.now ?? new Date());
    const quarantined = state.duplicateFiles.map((item) => {
        const targetPath = uniqueQuarantinePath(quarantineDir, `${stamp}-${path.basename(item.filePath)}`);
        renameSync(item.filePath, targetPath);
        return { ...item, targetPath };
    });
    return { state, quarantined };
}
function listJsonFiles(cacheDir) {
    if (!existsSync(cacheDir))
        return [];
    return readdirSync(cacheDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => path.join(cacheDir, entry.name));
}
function findDuplicateToolNames(filePath) {
    const payload = parseCacheFile(filePath);
    if (!Array.isArray(payload?.tools))
        return [];
    const counts = new Map();
    for (const tool of payload.tools) {
        if (typeof tool?.tool_name !== "string" || tool.tool_name.length === 0)
            continue;
        counts.set(tool.tool_name, (counts.get(tool.tool_name) ?? 0) + 1);
    }
    return [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([name]) => name)
        .sort();
}
function parseCacheFile(filePath) {
    try {
        return JSON.parse(readFileSync(filePath, "utf8"));
    }
    catch {
        return null;
    }
}
function uniqueQuarantinePath(quarantineDir, fileName) {
    let candidate = path.join(quarantineDir, fileName);
    let suffix = 1;
    while (existsSync(candidate)) {
        candidate = path.join(quarantineDir, `${suffix}-${fileName}`);
        suffix += 1;
    }
    return candidate;
}
function toFileStamp(date) {
    return date.toISOString().replace(/[:.]/g, "-");
}
function getCodexHome(env = process.env) {
    return env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
}
