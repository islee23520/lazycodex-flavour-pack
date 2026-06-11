import test from "node:test";
import assert from "node:assert/strict";

import { runSetupTui, shouldUseSetupTui } from "../scripts/setup-tui.mjs";

test("given interactive setup when TTY is available then uses the Clack TUI path", () => {
  assert.equal(
    shouldUseSetupTui({}, { check: false, input: { isTTY: true }, output: { isTTY: true } }),
    true
  );
});

test("given setup is non-TTY or no-tui when routing then keeps the legacy line-output path", () => {
  assert.equal(
    shouldUseSetupTui({}, { check: false, input: { isTTY: false }, output: { isTTY: true } }),
    false
  );
  assert.equal(
    shouldUseSetupTui({ noTui: true }, { check: false, input: { isTTY: true }, output: { isTTY: true } }),
    false
  );
  assert.equal(
    shouldUseSetupTui({}, { check: true, input: { isTTY: true }, output: { isTTY: true } }),
    false
  );
});

test("given TUI setup is cancelled when running then it does not call the setup writer", async () => {
  const calls = [];
  const cancelToken = Symbol("cancel");
  const prompts = {
    intro: (message) => calls.push(["intro", message]),
    note: (message, title) => calls.push(["note", title, message]),
    confirm: async () => cancelToken,
    isCancel: (value) => value === cancelToken,
    cancel: (message) => calls.push(["cancel", message]),
    spinner: () => ({
      start: (message) => calls.push(["spinner-start", message]),
      stop: (message) => calls.push(["spinner-stop", message])
    }),
    outro: (message) => calls.push(["outro", message])
  };

  await assert.rejects(
    runSetupTui(
      {},
      { check: false, root: "/tmp/lfp", defaultConfig: "/tmp/lfp/config.toml" },
      {
        prompts,
        colors: { inverse: (value) => value, green: (value) => value },
        runLineSetup: async () => calls.push(["line-setup"])
      }
    ),
    /cancelled/
  );

  assert.deepEqual(calls, [
    ["intro", " LFP setup "],
    [
      "note",
      "LazyCodex overlay",
      "Install and enable lfp@islee23520.\nRun LazyCodex install first unless explicitly skipped.\nApply only LFP-owned agents, hooks, provider consent, and model-field overrides."
    ],
    ["cancel", "LFP setup cancelled."]
  ]);
});

test("given TUI setup is confirmed when running then calls the legacy setup writer without spinner interference", async () => {
  const calls = [];
  const prompts = {
    intro: (message) => calls.push(["intro", message]),
    note: (message, title) => calls.push(["note", title, message]),
    confirm: async () => true,
    isCancel: () => false,
    cancel: (message) => calls.push(["cancel", message]),
    spinner: () => ({
      start: (message) => calls.push(["spinner-start", message]),
      stop: (message) => calls.push(["spinner-stop", message])
    }),
    outro: (message) => calls.push(["outro", message])
  };

  await runSetupTui(
    {},
    { check: false, root: "/tmp/lfp", defaultConfig: "/tmp/lfp/config.toml" },
    {
      prompts,
      colors: { inverse: (value) => value, green: (value) => value },
      runLineSetup: async (args) => calls.push(["line-setup", args.noTui])
    }
  );

  assert.deepEqual(calls.filter((call) => call[0].startsWith("spinner")), []);
  assert.deepEqual(calls.find((call) => call[0] === "line-setup"), ["line-setup", true]);
  assert.equal(calls.at(-1)[0], "outro");
});
