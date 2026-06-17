const DEFAULT_SCOPE = {
  line: "normal Codex sessions via CODEX_HOME/config.toml",
  tui: "normal Codex sessions"
};

const ULW_SCOPE = {
  line: "ultrawork runs via CODEX_HOME/ulw.config.toml",
  tui: "ultrawork runs"
};

export function getModelSettingScope(agentName) {
  if (agentName === "default") return DEFAULT_SCOPE;
  if (agentName === "ulw") return ULW_SCOPE;
  return {
    line: "only this agent when that agent is invoked",
    tui: "this agent only"
  };
}

export function logModelSettingScope(output, agentName, displayName) {
  const scope = getModelSettingScope(agentName);
  output?.log?.(`  Affects: ${formatLineScope(scope.line, displayName)}`);
}

function formatLineScope(scope, displayName) {
  if (scope !== "only this agent when that agent is invoked") return scope;
  return `only the ${displayName ?? "selected"} agent when that agent is invoked`;
}
