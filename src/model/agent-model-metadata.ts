// LFP no longer ships its own agent tomls. The five legacy LFP-owned agents
// (oracle, prometheus, hephaestus, atlas, sisyphus-junior) are not dispatched by
// upstream OMO/LazyCodex, so installing them only created orphan overrides.
// LFP now rides on the existing OMO agent surface. The Sisyphus routing rule
// (~/.opencode/rules/hephaestus.md) is preserved by sisyphus-main-routing.ts and
// falls back to lazycodex-executor when no hephaestus toml is installed.
export const LFP_OWNED_AGENT_NAMES = [];
export const ART_AGENT_NAMES = [];
export const ART_AGENT_METADATA = {};

export function getAgentDisplayName(agentName) {
  return agentName;
}

export function getAgentDescription(agentName) {
  return ART_AGENT_METADATA[agentName]?.description ?? null;
}

export function isLfpOwnedAgent(agentName) {
  return LFP_OWNED_AGENT_NAMES.includes(agentName);
}

export function isArtAgent(agentName) {
  return ART_AGENT_NAMES.includes(agentName);
}
