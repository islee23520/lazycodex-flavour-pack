export const REMOVED_LFP_AGENT_NAMES = new Set([
    "artistry",
    "artistry-gen",
    "artistry-qa",
    "sisyphus",
    "visual-engineering",
    "visual-looker"
]);
export const REMOVED_UPSTREAM_AGENT_NAMES = new Set(["codex-ultrawork-reviewer"]);
export const REMOVED_AGENT_NAMES = new Set([...REMOVED_LFP_AGENT_NAMES, ...REMOVED_UPSTREAM_AGENT_NAMES]);
export const REMOVED_LFP_AGENT_FILES = [...REMOVED_LFP_AGENT_NAMES].map((agentName) => `${agentName}.toml`);
export function pruneRemovedLfpAgentOverrides(overrides = {}) {
    return Object.fromEntries(Object.entries(overrides).filter(([agentName]) => !REMOVED_AGENT_NAMES.has(agentName)));
}
