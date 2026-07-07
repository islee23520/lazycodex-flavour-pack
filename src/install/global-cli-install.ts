import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

import { BACK_SELECTION, promptForYesNo } from "../model/model-config-prompts.js";

const NPM_BIN = "npm";

export function formatGlobalCliInstallCommand(packageRoot) {
  return `${NPM_BIN} install -g ${JSON.stringify(resolveGlobalCliInstallTarget(packageRoot))}`;
}

export async function maybeInstallGlobalCli(args, packageRoot, options = {}) {
  if (args.skipGlobalCli === true) return { installed: false, skipped: true };

  const shouldInstall =
    args.globalCli === true || (isInteractive(options) && (await promptForGlobalCliInstall(packageRoot, options)));
  if (shouldInstall !== true) return { installed: false, skipped: true };

  installGlobalCli(packageRoot, options);
  return { installed: true, skipped: false };
}

export function installGlobalCli(packageRoot, options = {}) {
  const runner = options.spawnSync ?? spawnSync;
  const target = options.installTarget ?? resolveGlobalCliInstallTarget(packageRoot);
  const result = runner(NPM_BIN, ["install", "-g", target], {
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.stdout?.length > 0) process.stdout.write(result.stdout);
  if (result.stderr?.length > 0) process.stderr.write(result.stderr);
  if (result.error !== undefined) throw result.error;
  if (result.status === 0) {
    console.log("lfp setup: installed global lfp CLI.");
    return;
  }

  throw new Error(`global lfp CLI install failed with exit code ${result.status}`);
}

export function resolveGlobalCliInstallTarget(packageRoot) {
  const root = path.resolve(packageRoot);
  if (existsSync(path.join(root, ".git"))) return root;

  const manifest = readPackageManifest(root);
  if (manifest.name === null || manifest.version === null) return root;
  return `${manifest.name}@${manifest.version}`;
}

async function promptForGlobalCliInstall(packageRoot, options) {
  const question = `  Install or update the global lfp CLI now? This runs ${formatGlobalCliInstallCommand(
    packageRoot
  )} [y/N]: `;
  const rl = options.readline;
  if (typeof options.globalCliConsentSelector === "function") {
    const selected = await options.globalCliConsentSelector({ question, packageRoot });
    return selected === BACK_SELECTION ? false : selected === true;
  }
  if (typeof options.yesNoSelector === "function") {
    const selected = await options.yesNoSelector({ question });
    return selected === BACK_SELECTION ? false : selected === true;
  }
  const ownedReadline = rl ?? createInterface({ input: process.stdin, output: process.stdout });
  try {
    const selected = await promptForYesNo(ownedReadline, question);
    return selected === BACK_SELECTION ? false : selected === true;
  } finally {
    if (rl === undefined) ownedReadline.close();
  }
}

function isInteractive(options) {
  if (options.interactive === true) return true;
  if (options.interactive === false) return false;
  return process.stdin.isTTY === true;
}

function readPackageManifest(packageRoot) {
  try {
    const data = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    return {
      name: typeof data.name === "string" && data.name.length > 0 ? data.name : null,
      version: typeof data.version === "string" && data.version.length > 0 ? data.version : null
    };
  } catch (error) {
    if (error instanceof Error) return { name: null, version: null };
    throw error;
  }
}
