import * as clack from "@clack/prompts";
import pc from "picocolors";

import { PLUGIN_REF } from "./codex-plugin-install.mjs";
import { createProviderConsentSelector } from "./setup-provider-tui.mjs";
import {
  createGitHubStartSelector,
  createModelSelector,
  createReasoningSelector,
  createTierSelector,
  createYesNoSelector
} from "./setup-tui-selectors.mjs";

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
      "Apply provider consent and supported model-field overrides to existing OMO/LazyCodex agents."
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

  const capturedOutput = [];
  const restoreConsole = captureConsoleOutput(capturedOutput);
  try {
    await runLineSetup({ ...args, noTui: true }, context, {
      modelSelector: createModelSelector(prompts),
      tierSelector: createTierSelector(prompts),
      reasoningSelector: createReasoningSelector(prompts),
      yesNoSelector: createYesNoSelector(prompts),
      gitHubStartSelector: createGitHubStartSelector(prompts),
      providerConsentSelector: createProviderConsentSelector(prompts)
    });
  } finally {
    restoreConsole();
  }

  if (capturedOutput.length > 0) prompts.note(capturedOutput.join("\n"), "Setup results");
  prompts.outro(colors.green(`Enabled ${PLUGIN_REF}. Run lfp doctor to verify anytime.`));
}

function captureConsoleOutput(lines) {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values) => lines.push(values.map(String).join(" "));
  console.error = (...values) => lines.push(values.map(String).join(" "));
  return () => {
    console.log = originalLog;
    console.error = originalError;
  };
}
