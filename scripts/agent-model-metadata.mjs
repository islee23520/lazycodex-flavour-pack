export const LFP_OWNED_AGENT_NAMES = [
  "sisyphus",
  "visual-engineering",
  "visual-looker",
  "artistry",
  "artistry-gen",
  "artistry-qa"
];

export const ART_AGENT_NAMES = ["artistry", "artistry-gen", "artistry-qa"];

export const ART_AGENT_METADATA = {
  artistry: {
    label: "Art Director (supervisor)",
    description: "Sets creative direction, writes art briefs, manages the production loop. Called 2-3 times total."
  },
  "artistry-gen": {
    label: "Production Worker (loop)",
    description: "Computer Use worker that operates the creative tool. Runs the inner loop (many calls, must be cheap)."
  },
  "artistry-qa": {
    label: "Visual QA Inspector",
    description: "Inspects screenshots against art brief criteria. Called at each checkpoint."
  }
};

export function getAgentDisplayName(agentName) {
  const meta = ART_AGENT_METADATA[agentName];
  return meta ? `${agentName} (${meta.label})` : agentName;
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
