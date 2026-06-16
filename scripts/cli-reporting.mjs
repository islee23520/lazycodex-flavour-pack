import { getCodexAppsToolCacheState, quarantineDuplicateCodexAppsToolCaches } from "./codex-apps-cache.mjs";
import { getInstallSmokeState, getVisualSmokeState } from "./codex-plugin-install.mjs";
import { readCurrentConfig } from "./art-team-config.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AGENT_MODEL_FIELDS, VIRTUAL_OVERRIDE_SECTIONS } from "./model-field-scope.mjs";
import { getProviderModelInventoryState } from "./model-provider.mjs";
import { classifyModelInventory } from "./model-inventory.mjs";
import { readOverrideConfig } from "./model-override-config.mjs";
import { isLfpOwnedAgent } from "./agent-model-metadata.mjs";
import { readRolePolicyConfig, ROLE_POLICY_REPORT_ORDER } from "./role-policy-config.mjs";
import { readTomlString } from "./toml-string-utils.mjs";

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

export async function printProviderInventoryVisibility(options = {}) {
  const inventory = await getProviderModelInventoryState(options);
  const activeProviderId = inventory.provider.id ?? "missing";
  console.log(`lfp ${options.commandName ?? "doctor"}: active provider id: ${activeProviderId}`);

  if (inventory.status !== "available") {
    console.log(
      `lfp ${options.commandName ?? "doctor"}: provider inventory: degraded visibility (${redactSecretText(
        inventory.error ?? "unavailable"
      )}); keeping current saved/configured values; manual model entry remains available`
    );
    return { ok: true, inventory };
  }

  const families = [...new Set(classifyModelInventory(inventory.models).map((model) => model.family))].sort((left, right) =>
    left.localeCompare(right)
  );
  console.log(
    `lfp ${options.commandName ?? "doctor"}: provider inventory: ${inventory.models.length} models (families: ${families.join(", ")})`
  );
  return { ok: true, inventory };
}

export function printAgentModelDrift(configPath, options = {}) {
  const drift = collectAgentModelDrift(configPath);
  const commandName = options.commandName ?? "doctor";
  if (drift.items.length === 0) {
    console.log(`lfp ${commandName}: agent model drift: none`);
    return { ok: true, drift };
  }

  console.log(`lfp ${commandName}: agent model drift: detected`);
  for (const item of drift.items) {
    console.log(`lfp ${commandName}: agent model drift: ${item.agentName}: ${item.kinds.join(", ")} (${item.filePath})`);
  }
  return { ok: false, drift };
}

export function printApplierPreservationStatus(options = {}) {
  const commandName = options.commandName ?? "doctor";
  if (options.agentModelsOnly !== true) {
    console.log(`lfp ${commandName}: global defaults: synced (default mode)`);
  } else {
    console.log(`lfp ${commandName}: global defaults: preserved (agent-only mode)`);
  }
  console.log(`lfp ${commandName}: OMO hook state: preserved`);
}

export function printRolePolicyConfig(options = {}) {
  const commandName = options.commandName ?? "doctor";
  const config = readRolePolicyConfig({ env: process.env, ...options });
  const source = config.source.userPath === null ? "packaged defaults" : `user overrides (${config.source.userPath})`;

  console.log(`lfp ${commandName}: role policies: ${source}`);
  for (const role of ROLE_POLICY_REPORT_ORDER) {
    const fields = config.policies[role];
    if (fields === undefined) continue;
    console.log(`  ${role}: reasoning=${fields.reasoning}, tier=${fields.tier}`);
  }

  return { ok: true, config };
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

function collectAgentModelDrift(configPath) {
  const config = readOverrideConfig(configPath);
  const overrides = Object.entries(config.overrides ?? {}).filter(
    ([agentName]) => !VIRTUAL_OVERRIDE_SECTIONS.has(agentName) && isLfpOwnedAgent(agentName)
  );
  const items = [];

  for (const [agentName, fields] of overrides) {
    const filePath = path.join(config.source.agentsDir, `${agentName}.toml`);
    const currentText = readFileSync(filePath, "utf8");
    const driftFields = [...AGENT_MODEL_FIELDS].filter((fieldName) => {
      return Object.hasOwn(fields, fieldName) && readTomlString(currentText, fieldName) !== String(fields[fieldName]);
    });
    if (driftFields.length === 0) continue;
    items.push({
      agentName,
      filePath,
      fields: driftFields,
      kinds: ["model"]
    });
  }

  return { items };
}

function redactSecretText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9._~+/=-]+/g, "sk-[REDACTED]")
    .replace(/([?&](?:api[_-]?key|token|auth|authorization)=)[^&\s]+/gi, "$1[REDACTED]");
}
