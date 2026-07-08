export const LFP_OWNED_AGENT_NAMES = ["oracle", "prometheus", "hephaestus", "atlas", "sisyphus-junior"];
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
