import * as clack from "@clack/prompts";
import pc from "picocolors";

import { PLUGIN_REF } from "./codex-plugin-install.mjs";

export function shouldUseSetupTui(args, options) {
  if (options.check || args.noTui === true) return false;
  return options.input?.isTTY === true && options.output?.isTTY === true;
}

export async function runSetupTui(args, context, deps = {}) {
  const prompts = deps.prompts ?? clack;
  const colors = deps.colors ?? pc;
  const runLineSetup = deps.runLineSetup;
  if (runLineSetup === undefined) throw new Error("runSetupTui requires runLineSetup");

  prompts.intro(colors.inverse(" LFP setup "));
  prompts.note(
    [
      `Install and enable ${PLUGIN_REF}.`,
      "Run LazyCodex install first unless explicitly skipped.",
      "Apply only LFP-owned agents, hooks, provider consent, and model-field overrides."
    ].join("\n"),
    "LazyCodex overlay"
  );

  const proceed = await prompts.confirm({
    message: "Continue with LFP setup?",
    initialValue: true
  });
  if (prompts.isCancel(proceed) || proceed !== true) {
    prompts.cancel("LFP setup cancelled.");
    throw new Error("LFP setup cancelled");
  }

  try {
    await runLineSetup({ ...args, noTui: true }, context);
  } catch (error) {
    throw error;
  }

  prompts.outro(colors.green(`Enabled ${PLUGIN_REF}. Run lfp doctor to verify anytime.`));
}
