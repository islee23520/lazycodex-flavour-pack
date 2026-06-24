import assert from "node:assert/strict";
import test from "node:test";

import { BACK_SELECTION } from "../src/model/model-config-prompts.ts";
import { runSetupTui, shouldUseSetupTui } from "../src/tui/setup-tui.ts";

test("given interactive setup when TTY is available then uses the Clack TUI path", () => {
  assert.equal(shouldUseSetupTui({}, { check: false, input: { isTTY: true }, output: { isTTY: true } }), true);
});

test("given setup is non-TTY or no-tui when routing then keeps the legacy line-output path", () => {
  assert.equal(shouldUseSetupTui({}, { check: false, input: { isTTY: false }, output: { isTTY: true } }), false);
  assert.equal(
    shouldUseSetupTui({ noTui: true }, { check: false, input: { isTTY: true }, output: { isTTY: true } }),
    false
  );
  assert.equal(shouldUseSetupTui({}, { check: true, input: { isTTY: true }, output: { isTTY: true } }), false);
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
      "Install and enable lfp@islee23520.\nRun LazyCodex install first unless explicitly skipped.\nApply provider consent and supported model-field overrides to existing OMO/LazyCodex agents."
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

  assert.deepEqual(
    calls.filter((call) => call[0].startsWith("spinner")),
    []
  );
  assert.deepEqual(
    calls.find((call) => call[0] === "line-setup"),
    ["line-setup", true]
  );
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

  assert.deepEqual(
    calls.find((call) => call[0] === "select"),
    [
      "select",
      "explorer model (affects this agent only)",
      [
        { value: "gpt-5.4-mini", label: "gpt-5.4-mini (current)", hint: "current" },
        { value: "gpt-5.5", label: "gpt-5.5", hint: undefined },
        { value: BACK_SELECTION, label: "Back to previous setting", hint: "return without saving this field" }
      ],
      "gpt-5.4-mini"
    ]
  );
  assert.deepEqual(
    calls.find((call) => call[0] === "selected"),
    ["selected", "gpt-5.5"]
  );
});

test("given TUI setup fallback selector when line setup asks then labels fallback prompt without readline", async () => {
  const calls = [];
  const prompts = {
    intro: (message) => calls.push(["intro", message]),
    note: (message, title) => calls.push(["note", title, message]),
    confirm: async () => true,
    select: async (options) => {
      calls.push(["select", options.message, options.options, options.initialValue]);
      return options.initialValue;
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
          agentName: "plan",
          displayName: "plan fallback",
          current: "manual-fallback-model",
          choices: []
        });
        calls.push(["selected", selected]);
      }
    }
  );

  assert.deepEqual(
    calls.find((call) => call[0] === "select"),
    [
      "select",
      "plan fallback model (affects this agent only)",
      [
        { value: "manual-fallback-model", label: "manual-fallback-model (current)", hint: "custom id" },
        { value: BACK_SELECTION, label: "Back to previous setting", hint: "return without saving this field" }
      ],
      "manual-fallback-model"
    ]
  );
  assert.deepEqual(
    calls.find((call) => call[0] === "selected"),
    ["selected", "manual-fallback-model"]
  );
});

test("given TUI setup default model selector when line setup asks then labels default and ULW choices explicitly", async () => {
  const calls = [];
  const prompts = {
    intro: (message) => calls.push(["intro", message]),
    note: (message, title) => calls.push(["note", title, message]),
    confirm: async () => true,
    select: async (options) => {
      calls.push(["select", options.message, options.options, options.initialValue]);
      return options.initialValue;
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
        await options.modelSelector({
          agentName: "default",
          displayName: "Default Codex",
          current: "gpt-5.5",
          choices: [{ value: "gpt-5.5", label: "gpt-5.5", aliases: ["gpt-5.5"], key: "gpt-5.5" }]
        });
        await options.modelSelector({
          agentName: "ulw",
          displayName: "ULW",
          current: "gpt-5.5",
          choices: [{ value: "gpt-5.5", label: "gpt-5.5", aliases: ["gpt-5.5"], key: "gpt-5.5" }]
        });
      }
    }
  );

  assert.ok(
    calls.some((call) => call[0] === "select" && call[1] === "Default Codex model (affects normal Codex sessions)")
  );
  assert.ok(calls.some((call) => call[0] === "select" && call[1] === "ULW model (affects ultrawork runs)"));
});

test("given TUI first-run model guide when setup prompts then shows scope and defaults before selection", async () => {
  const calls = [];
  const prompts = {
    intro: (message) => calls.push(["intro", message]),
    note: (message, title) => calls.push(["note", title, message]),
    confirm: async () => true,
    select: async (options) => {
      calls.push(["select", options.message, options.initialValue]);
      return options.initialValue;
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
        await options.modelSelector({
          agentName: "default",
          displayName: "Default Codex",
          current: "gpt-5.5",
          choices: [{ value: "gpt-5.5", label: "gpt-5.5", aliases: ["gpt-5.5"], key: "gpt-5.5" }]
        });
        await options.modelSelector({
          agentName: "ulw",
          displayName: "ULW",
          current: "gpt-5.5",
          choices: [{ value: "gpt-5.5", label: "gpt-5.5", aliases: ["gpt-5.5"], key: "gpt-5.5" }]
        });
        await options.modelSelector({
          agentName: "explorer",
          displayName: "explorer",
          current: "gpt-5.4-mini",
          vanillaRecommendation: "gpt-5.4-mini",
          vanillaRecommendationFields: {
            model: "gpt-5.4-mini",
            model_reasoning_effort: "low",
            service_tier: "fast"
          },
          choices: [{ value: "gpt-5.4-mini", label: "gpt-5.4-mini", aliases: ["gpt-5.4-mini"], key: "gpt-5.4-mini" }]
        });
      }
    }
  );

  const defaultNoteIndex = calls.findIndex((call) => call[0] === "note" && call[1] === "Default Codex model guide");
  const defaultSelectIndex = calls.findIndex(
    (call) => call[0] === "select" && call[1].startsWith("Default Codex model")
  );
  const ulwNoteIndex = calls.findIndex((call) => call[0] === "note" && call[1] === "ULW model guide");
  const ulwSelectIndex = calls.findIndex((call) => call[0] === "select" && call[1].startsWith("ULW model"));
  const explorerNoteIndex = calls.findIndex((call) => call[0] === "note" && call[1] === "explorer model guide");
  const explorerSelectIndex = calls.findIndex((call) => call[0] === "select" && call[1].startsWith("explorer model"));

  assert.ok(defaultNoteIndex >= 0 && defaultNoteIndex < defaultSelectIndex);
  assert.ok(ulwNoteIndex >= 0 && ulwNoteIndex < ulwSelectIndex);
  assert.ok(explorerNoteIndex >= 0 && explorerNoteIndex < explorerSelectIndex);
  assert.match(calls[defaultNoteIndex][2], /Affects: normal Codex sessions via CODEX_HOME\/config\.toml/);
  assert.match(calls[defaultNoteIndex][2], /Role guide: Default Codex sessions\./);
  assert.match(calls[defaultNoteIndex][2], /Current\/default: gpt-5\.5 \(reasoning: unset, tier: unset\)/);
  assert.match(calls[ulwNoteIndex][2], /Affects: ultrawork runs via CODEX_HOME\/ulw\.config\.toml/);
  assert.match(
    calls[ulwNoteIndex][2],
    /Minimum capability: Use a frontier reasoning model with high or xhigh reasoning; default tier is acceptable\./
  );
  assert.match(
    calls[explorerNoteIndex][2],
    /Vanilla LazyCodex recommendation: gpt-5\.4-mini \(reasoning: low, tier: fast\)/
  );
  assert.match(calls[explorerNoteIndex][2], /Tune for: low-latency repository navigation and concise evidence\./);
  assert.equal(
    calls.some((call) => String(call[2] ?? "").includes("Edit agent model overrides now")),
    false
  );
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
      runLineSetup: async () => console.log("lfp setup: installed plugin")
    }
  );

  assert.deepEqual(calls.at(-2), ["note", "Setup results", "lfp setup: installed plugin"]);
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
        if (options.modelSelector)
          await options.modelSelector({
            agentName: "explorer",
            current: "gpt-5.4-mini",
            choices: [
              {
                value: "grok-3-mini-fast",
                label: "grok-3-mini-fast",
                key: "grok-3-mini-fast",
                aliases: ["grok-3-mini-fast"]
              }
            ]
          });
        if (options.tierSelector) await options.tierSelector({ agentName: "explorer", current: "default" });
        if (options.reasoningSelector) await options.reasoningSelector({ agentName: "explorer", current: "low" });
      }
    }
  );

  assert.ok(
    calls.some((c) => c[0] === "selectors" && c[1] && c[2] && c[3]),
    "all three selectors must be provided to runLineSetup"
  );
  assert.ok(
    calls.some((c) => c[0] === "select" && /explorer model/.test(c[1])),
    "model select happened"
  );
  assert.ok(
    calls.some((c) => c[0] === "select" && /explorer service tier/.test(c[1])),
    "tier select happened"
  );
  assert.ok(
    calls.some((c) => c[0] === "select" && /explorer reasoning effort/.test(c[1])),
    "reasoning select happened"
  );
});

test("given TUI OMO overrides with additional agents then uses yesNoSelector and continues to GitHub selector", async () => {
  const calls = [];
  const prompts = {
    intro: (m) => calls.push(["intro", m]),
    note: (m, t) => calls.push(["note", t, m]),
    confirm: async (opts) => {
      calls.push(["confirm", opts.message]);
      return true;
    },
    select: async (opts) => {
      calls.push(["select", opts.message]);
      if (/Change lazycodex-code-reviewer/.test(opts.message)) return true;
      if (/GitHub/.test(opts.message)) return "1";
      return opts.initialValue ?? opts.options?.[0]?.value;
    },
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
          const willChange = await opts.yesNoSelector({ question: "  Change lazycodex-code-reviewer ... [y/N]: " });
          calls.push(["additionalYes", willChange]);
        }
        // then fields for the additional
        if (opts.modelSelector)
          await opts.modelSelector({
            agentName: "lazycodex-code-reviewer",
            current: "gpt-5.5",
            choices: [{ value: "gpt-5.5", label: "gpt-5.5", key: "gpt-5.5", aliases: ["gpt-5.5"] }]
          });
        if (opts.tierSelector) await opts.tierSelector({ agentName: "lazycodex-code-reviewer", current: "default" });
        if (opts.reasoningSelector)
          await opts.reasoningSelector({ agentName: "lazycodex-code-reviewer", current: "xhigh" });
        // finally GitHub
        if (opts.gitHubStartSelector) {
          const gh = await opts.gitHubStartSelector();
          calls.push(["github", gh ? gh.id : "skip", gh?.repo, gh?.url]);
        }
      }
    }
  );

  assert.ok(
    calls.some((c) => c[0] === "hasYesNo" && c[1]),
    "yesNoSelector provided"
  );
  assert.ok(
    calls.some((c) => c[0] === "hasGitHub" && c[1]),
    "gitHubStartSelector provided"
  );
  assert.ok(
    calls.some((c) => c[0] === "select" && /Change lazycodex-code-reviewer/.test(c[1])),
    "yes/no select for additional agent used"
  );
  assert.ok(
    calls.some((c) => c[0] === "additionalYes" && c[1] === true),
    "answered yes to additional"
  );
  assert.ok(
    calls.some((c) => c[0] === "select" && /lazycodex-code-reviewer model/.test(c[1])),
    "additional model select"
  );
  assert.ok(
    calls.some((c) => c[0] === "select" && /GitHub/.test(c[1])),
    "reached GitHub selector"
  );
  assert.deepEqual(
    calls.find((c) => c[0] === "github"),
    ["github", "lazycodex-ai", "sisyphuslabs/lazycodex-ai", "https://github.com/sisyphuslabs/lazycodex-ai"]
  );
});
