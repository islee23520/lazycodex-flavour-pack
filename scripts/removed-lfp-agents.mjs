export const REMOVED_LFP_AGENT_NAMES = new Set([
  "artistry",
  "artistry-gen",
  "artistry-qa",
  "sisyphus",
  "visual-engineering",
  "visual-looker"
]);

export const REMOVED_LFP_AGENT_FILES = [...REMOVED_LFP_AGENT_NAMES].map((agentName) => `${agentName}.toml`);

export function pruneRemovedLfpAgentOverrides(overrides = {}) {
  return Object.fromEntries(
    Object.entries(overrides).filter(([agentName]) => !REMOVED_LFP_AGENT_NAMES.has(agentName))
  );
}
