#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { syncAgentOverrides, syncGlobalModelDefaults } from "./sync-agent-overrides.mjs";
import { createRestoredUserOverrideConfig } from "./user-model-overrides.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_CONFIG = path.join(ROOT, "agent-configs", "omo-agent-model-overrides.toml");
const SUPPORTED_EVENTS = new Set(["SessionStart", "UserPromptSubmit"]);

if (isDirectRun()) {
  await readStdin();
  runOverrideSyncHook({ hook_event_name: process.env.LFP_HOOK_EVENT_NAME });
}

export function runOverrideSyncHook(value = {}, options = {}) {
  const eventName = getHookEventName(value);
  if (eventName !== null && !SUPPORTED_EVENTS.has(eventName)) return "";

  const configPath = options.configPath ?? DEFAULT_CONFIG;
  const restored = createRestoredUserOverrideConfig(configPath, options);
  const effectiveConfigPath = restored?.configPath ?? configPath;

  try {
    syncAgentOverrides(effectiveConfigPath, { check: false, env: options.env });
    if (shouldSyncGlobalDefaults(options)) {
      syncGlobalModelDefaults(effectiveConfigPath, { check: false, env: options.env });
    }
  } catch {
    return "";
  } finally {
    restored?.cleanup();
  }

  return "";
}

function shouldSyncGlobalDefaults(options) {
  return options.syncGlobalDefaults === true || options.env?.LFP_SYNC_GLOBAL_DEFAULTS === "1";
}

function getHookEventName(value) {
  if (value === null || typeof value !== "object") return null;
  const name = value.hook_event_name;
  return typeof name === "string" ? name : null;
}

function readStdin() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.on("data", () => {});
    process.stdin.on("end", resolve);
  });
}

function isDirectRun() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
