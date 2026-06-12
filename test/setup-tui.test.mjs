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

test("given TUI setup model selector when line setup asks for model then uses Clack select options", async () => {
  const calls = [];
  const prompts = {
    intro: (message) => calls.push(["intro", message]),
    note: (message, title) => calls.push(["note", title, message]),
    confirm: async () => true,
    select: async (options) => {
      calls.push(["select", options.message, options.options, options.initialValue]);
      return "gpt-5.5";
    },
    isCancel: () => false,
    cancel: (message) => calls.push(["cancel", message]),
    outro: (message) => calls.push(["outro", message])
  };

  await runSetupTui(
    {},
    { check: false, root: "/tmp/lfp", defaultConfig: "/tmp/lfp/config.toml" },
    {
      prompts,
      colors: { inverse: (value) => value, green: (value) => value },
      runLineSetup: async (_args, _context, options) => {
        const selected = await options.modelSelector({
          agentName: "explorer",
          current: "gpt-5.4-mini",
          choices: [
            { value: "gpt-5.4-mini", label: "gpt-5.4-mini", aliases: ["gpt-5.4-mini"], key: "gpt-5.4-mini" },
            { value: "gpt-5.5", label: "gpt-5.5", aliases: ["gpt-5.5"], key: "gpt-5.5" }
          ]
        });
        calls.push(["selected", selected]);
      }
    }
  );

  assert.deepEqual(calls.find((call) => call[0] === "select"), [
    "select",
    "explorer model",
    [
      { value: "gpt-5.4-mini", label: "gpt-5.4-mini", hint: "current" },
      { value: "gpt-5.5", label: "gpt-5.5", hint: undefined }
    ],
    "gpt-5.4-mini"
  ]);
  assert.deepEqual(calls.find((call) => call[0] === "selected"), ["selected", "gpt-5.5"]);
});

test("given TUI setup writer logs status when running then status is shown as framed setup results", async () => {
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
      runLineSetup: async () => console.log("lfp setup: installed LFP agents")
    }
  );

  assert.deepEqual(calls.at(-2), ["note", "Setup results", "lfp setup: installed LFP agents"]);
  assert.equal(calls.at(-1)[0], "outro");
});



test("given TUI setup when line setup asks for OMO overrides then passes tierSelector and reasoningSelector", async () => {
  const calls = [];
  const prompts = {
    intro: (message) => calls.push(["intro", message]),
    note: (message, title) => calls.push(["note", title, message]),
    confirm: async () => true,
    select: async (options) => {
      calls.push(["select", options.message]);
      return options.initialValue ?? options.options[0]?.value;
    },
    isCancel: () => false,
    cancel: (message) => calls.push(["cancel", message]),
    outro: (message) => calls.push(["outro", message])
  };

  await runSetupTui(
    {},
    { check: false, root: "/tmp/lfp", defaultConfig: "/tmp/lfp/config.toml" },
    {
      prompts,
      colors: { inverse: (value) => value, green: (value) => value },
      runLineSetup: async (_args, _context, options) => {
        calls.push(["selectors", !!options.modelSelector, !!options.tierSelector, !!options.reasoningSelector]);
        if (options.modelSelector) await options.modelSelector({ agentName: "explorer", current: "gpt-5.4-mini", choices: [
      { value: "grok-3-mini-fast", label: "grok-3-mini-fast", key: "grok-3-mini-fast", aliases: ["grok-3-mini-fast"] }
    ] });
        if (options.tierSelector) await options.tierSelector({ agentName: "explorer", current: "default" });
        if (options.reasoningSelector) await options.reasoningSelector({ agentName: "explorer", current: "low" });
      }
    }
  );

  assert.ok(calls.some(c => c[0] === "selectors" && c[1] && c[2] && c[3]), "all three selectors must be provided to runLineSetup");
  assert.ok(calls.some(c => c[0] === "select" && /explorer model/.test(c[1])), "model select happened");
  assert.ok(calls.some(c => c[0] === "select" && /explorer service tier/.test(c[1])), "tier select happened");
  assert.ok(calls.some(c => c[0] === "select" && /explorer reasoning effort/.test(c[1])), "reasoning select happened");
});



test("given TUI OMO overrides with additional agents then uses yesNoSelector and continues to GitHub selector", async () => {
  const calls = [];
  const prompts = {
    intro: (m) => calls.push(["intro", m]),
    note: (m, t) => calls.push(["note", t, m]),
    confirm: async (opts) => { calls.push(["confirm", opts.message]); return true; }, // answer yes to change the extra agent
    select: async (opts) => { calls.push(["select", opts.message]); return opts.initialValue ?? opts.options?.[0]?.value; },
    isCancel: () => false,
    cancel: (m) => calls.push(["cancel", m]),
    outro: (m) => calls.push(["outro", m])
  };

  await runSetupTui(
    {},
    { check: false, root: "/tmp/lfp", defaultConfig: "/tmp/lfp/config.toml" },
    {
      prompts,
      colors: { inverse: (v) => v, green: (v) => v },
      runLineSetup: async (_a, _c, opts) => {
        calls.push(["hasYesNo", typeof opts.yesNoSelector === "function"]);
        calls.push(["hasGitHub", typeof opts.gitHubStartSelector === "function"]);
        // simulate the "Adjust" yes (already handled by maybeRestore using yesNoSelector)
        // simulate one configured agent fields (would use model/tier/reasoning selectors)
        // then the additional agent yes/no
        if (opts.yesNoSelector) {
          const willChange = await opts.yesNoSelector({ question: "  Change codex-ultrawork-reviewer ... [y/N]: " });
          calls.push(["additionalYes", willChange]);
        }
        // then fields for the additional
        if (opts.modelSelector) await opts.modelSelector({ agentName: "codex-ultrawork-reviewer", current: "gpt-5.5", choices: [{value:"gpt-5.5", label:"gpt-5.5", key:"gpt-5.5", aliases:["gpt-5.5"]}] });
        if (opts.tierSelector) await opts.tierSelector({ agentName: "codex-ultrawork-reviewer", current: "default" });
        if (opts.reasoningSelector) await opts.reasoningSelector({ agentName: "codex-ultrawork-reviewer", current: "high" });
        // finally GitHub
        if (opts.gitHubStartSelector) {
          const gh = await opts.gitHubStartSelector();
          calls.push(["github", gh ? gh.id : "skip"]);
        }
      }
    }
  );

  assert.ok(calls.some(c => c[0] === "hasYesNo" && c[1]), "yesNoSelector provided");
  assert.ok(calls.some(c => c[0] === "hasGitHub" && c[1]), "gitHubStartSelector provided");
  assert.ok(calls.some(c => c[0] === "confirm" && /Change codex-ultrawork-reviewer/.test(c[1])), "yes/no confirm for additional agent used");
  assert.ok(calls.some(c => c[0] === "additionalYes" && c[1] === true), "answered yes to additional");
  assert.ok(calls.some(c => c[0] === "select" && /codex-ultrawork-reviewer model/.test(c[1])), "additional model select");
  assert.ok(calls.some(c => c[0] === "select" && /GitHub/.test(c[1]) || c[0]==="github"), "reached GitHub selector");
});
