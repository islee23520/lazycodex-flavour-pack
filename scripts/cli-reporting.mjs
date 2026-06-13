import { getCodexAppsToolCacheState, quarantineDuplicateCodexAppsToolCaches } from "./codex-apps-cache.mjs";
import { getInstallSmokeState, getVisualSmokeState } from "./codex-plugin-install.mjs";
import { readCurrentConfig } from "./art-team-config.mjs";

export function printCodexAppsCacheQuarantine() {
  const result = quarantineDuplicateCodexAppsToolCaches();
  if (result.quarantined.length === 0) {
    console.log("lfp setup: Codex Apps tool cache: ok");
    return true;
  }

  for (const item of result.quarantined) {
    console.log(
      `lfp setup: quarantined duplicate Codex Apps tool cache ${item.filePath} -> ${item.targetPath} (${item.duplicateToolNames.join(", ")})`
    );
  }
  return false;
}

export function printCodexAppsCacheState() {
  const state = getCodexAppsToolCacheState();
  if (state.healthy) {
    console.log("lfp doctor: Codex Apps tool cache: ok");
    return true;
  }

  console.log("lfp doctor: Codex Apps tool cache: duplicate tool names found");
  for (const item of state.duplicateFiles) {
    console.log(`lfp doctor: Codex Apps tool cache: ${item.filePath} duplicates ${item.duplicateToolNames.join(", ")}`);
  }
  console.log("lfp doctor: Codex Apps tool cache: run 'lfp setup' to quarantine stale duplicate cache files");
  return false;
}

export function printCodexAppsCacheFixPreview() {
  const state = getCodexAppsToolCacheState();
  if (state.healthy) {
    console.log("lfp doctor: Codex Apps tool cache: ok");
    return true;
  }

  for (const item of state.duplicateFiles) {
    console.log(
      `lfp doctor: would quarantine duplicate Codex Apps tool cache ${item.filePath} (${item.duplicateToolNames.join(", ")})`
    );
  }
  console.log("lfp doctor: Codex Apps tool cache: rerun with 'lfp doctor --fix-cache --apply' to quarantine");
  return false;
}

export function printCodexAppsCacheFixApply() {
  const result = quarantineDuplicateCodexAppsToolCaches();
  for (const item of result.quarantined) {
    console.log(
      `lfp doctor: quarantined duplicate Codex Apps tool cache ${item.filePath} -> ${item.targetPath} (${item.duplicateToolNames.join(", ")})`
    );
  }

  const state = getCodexAppsToolCacheState();
  if (state.healthy) {
    console.log("lfp doctor: Codex Apps tool cache: ok");
    return true;
  }

  console.log("lfp doctor: Codex Apps tool cache: duplicate tool names remain after quarantine");
  for (const item of state.duplicateFiles) {
    console.log(`lfp doctor: Codex Apps tool cache: ${item.filePath} duplicates ${item.duplicateToolNames.join(", ")}`);
  }
  return false;
}

export function printOpenAiCompatProviderState(state) {
  const provider = state.openAiCompatProvider;
  console.log(`lfp doctor: OpenAI-compatible provider: ${provider.status} (${provider.id})`);

  if (provider.activeStatus === "user-managed") {
    console.log(`lfp doctor: active model provider: user-managed (${provider.activeProvider})`);
  } else if (provider.activeStatus === "configured") {
    console.log(`lfp doctor: active model provider: ${provider.id}`);
  } else {
    console.log("lfp doctor: active model provider: missing");
  }

  return provider.status === "configured";
}

export function printInstallSmokeState() {
  const smoke = getInstallSmokeState();
  if (smoke.explorerPreserved) {
    console.log(`lfp install smoke: explorer preserved (${smoke.explorerPath})`);
    return true;
  }

  console.log(`lfp install smoke: explorer overwrite risk (${smoke.collisions.join(", ")})`);
  return false;
}

export function printVisualSmokeState() {
  const smoke = getVisualSmokeState();
  if (smoke.verified) {
    const summary = smoke.checks.map((check) => `${check.name}: ${check.actualModel}`).join(", ");
    console.log(`lfp doctor: visual smoke: verified (${summary})`);
    return true;
  }

  console.log("lfp doctor: visual smoke: failed");
  for (const check of smoke.checks) {
    if (check.status === "verified") continue;
    if (check.status === "missing") {
      console.log(`lfp doctor: visual smoke: ${check.name} missing (${check.filePath})`);
      continue;
    }
    if (check.status === "malformed") {
      console.log(`lfp doctor: visual smoke: ${check.name} missing model (${check.filePath})`);
      continue;
    }
    console.log(
      `lfp doctor: visual smoke: ${check.name} model mismatch: expected ${check.model}, got ${check.actualModel}`
    );
  }
  return false;
}

export function printArtTeamConfig() {
  const config = readCurrentConfig();
  console.log("lfp doctor: art team config:");
  for (const [name, fields] of Object.entries(config)) {
    console.log(`  ${name}: model=${fields.model}, reasoning=${fields.model_reasoning_effort}, tier=${fields.service_tier}`);
  }
}
