const SYNC_OPTIONS = new Set([
  "--check",
  "--config",
  "--skip-model-prompt",
  "--skip-lazycodex-install",
  "--no-tui",
  "--provider-id",
  "--provider-base-url",
  "--provider-wire-api",
  "--provider-api-key-env",
  "--agent-models-only",
  "--sync-global-defaults"
]);
const DOCTOR_OPTIONS = new Set(["--config", "--fix-cache", "--apply"]);
const KOREAN_POSTPOSITIONS = ["으로", "부터", "까지", "에게", "에서", "처럼", "보다", "만큼", "은", "는", "이", "가", "을", "를", "와", "과", "도", "만", "로"];

export function parseSyncArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeOption(argv[index], SYNC_OPTIONS);
    if (item === "--check") {
      parsed.check = true;
      continue;
    }
    if (item === "--config") {
      parsed.config = readOptionValue(argv, index, "--config");
      index += 1;
      continue;
    }
    if (item === "--skip-model-prompt") {
      parsed.skipModelPrompt = true;
      continue;
    }
    if (item === "--skip-lazycodex-install") {
      parsed.skipLazycodexInstall = true;
      continue;
    }
    if (item === "--no-tui") {
      parsed.noTui = true;
      continue;
    }
    if (item === "--provider-id") {
      parsed.providerId = readOptionValue(argv, index, "--provider-id");
      index += 1;
      continue;
    }
    if (item === "--provider-base-url") {
      parsed.providerBaseUrl = readOptionValue(argv, index, "--provider-base-url");
      index += 1;
      continue;
    }
    if (item === "--provider-wire-api") {
      parsed.providerWireApi = readOptionValue(argv, index, "--provider-wire-api");
      index += 1;
      continue;
    }
    if (item === "--provider-api-key-env") {
      parsed.providerApiKeyEnv = readOptionValue(argv, index, "--provider-api-key-env");
      index += 1;
      continue;
    }
    if (item === "--agent-models-only") {
      parsed.agentModelsOnly = true;
      continue;
    }
    if (item === "--sync-global-defaults") {
      parsed.syncGlobalDefaults = true;
      continue;
    }
    throw new Error(`Unknown sync option: ${item}`);
  }
  if (parsed.agentModelsOnly && parsed.syncGlobalDefaults) {
    throw new Error("--agent-models-only cannot be combined with --sync-global-defaults");
  }
  return parsed;
}

export function parseDoctorArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeOption(argv[index], DOCTOR_OPTIONS);
    if (item === "--config") {
      parsed.config = readOptionValue(argv, index, "--config");
      index += 1;
      continue;
    }
    if (item === "--fix-cache") {
      parsed.fixCache = true;
      continue;
    }
    if (item === "--apply") {
      parsed.apply = true;
      continue;
    }
    if (item === "--check") throw new Error("doctor does not accept --check; use dry-setup instead");
    throw new Error(`Unknown doctor option: ${item}`);
  }
  return parsed;
}

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (value === undefined) throw new Error(`${optionName} requires a value`);
  return value;
}

function normalizeOption(item, supportedOptions) {
  if (supportedOptions.has(item)) return item;
  if (!item.startsWith("--")) return item;

  for (const postposition of KOREAN_POSTPOSITIONS) {
    if (!item.endsWith(postposition)) continue;
    const normalized = item.slice(0, -postposition.length);
    if (supportedOptions.has(normalized)) return normalized;
  }

  return item;
}
