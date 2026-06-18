import { spawnSync } from "node:child_process";

const NPX_LAZYCODEX_INSTALL_BIN = "npx";
const NPX_LAZYCODEX_INSTALL_ARGS = ["lazycodex-ai@latest", "install"];

export function formatLazyCodexInstallCommand(env = process.env) {
  const command = getLazyCodexInstallCommand(env);
  return [command.bin, ...command.args].join(" ");
}

export function runLazyCodexInstall(env = process.env) {
  const command = getLazyCodexInstallCommand(env);
  const result = spawnSync(command.bin, command.args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  if (result.error !== undefined) throw result.error;
  if (result.status === 0) return;

  throw new Error(`lazycodex-ai install failed with exit code ${result.status}`);
}

function getLazyCodexInstallCommand(env) {
  const explicitBin = env.LFP_LAZYCODEX_INSTALL_BIN?.trim();
  if (explicitBin !== undefined && explicitBin.length > 0) {
    return {
      bin: explicitBin,
      args: parseInstallArgs(env.LFP_LAZYCODEX_INSTALL_ARGS, NPX_LAZYCODEX_INSTALL_ARGS)
    };
  }

  return {
    bin: NPX_LAZYCODEX_INSTALL_BIN,
    args: parseInstallArgs(env.LFP_LAZYCODEX_INSTALL_ARGS, NPX_LAZYCODEX_INSTALL_ARGS)
  };
}

function parseInstallArgs(value, defaultArgs) {
  if (value === undefined || value.trim().length === 0) return defaultArgs;
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error("LFP_LAZYCODEX_INSTALL_ARGS must be a JSON string array");
    }
    return parsed;
  }
  return trimmed.split(/\s+/);
}
