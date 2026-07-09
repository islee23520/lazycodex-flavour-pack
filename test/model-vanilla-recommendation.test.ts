import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { configureAgentModelOverrides } from "../src/model/agent-model-config.ts";
import { BACK_SELECTION } from "../src/model/model-config-prompts.ts";
import { runSetupTui } from "../src/tui/setup-tui.ts";

test("given setup model prompt when installed LazyCodex agent exists then shows vanilla recommendation before selection", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-vanilla-model-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(
      path.join(root, "explorer.toml"),
      agentText("explorer", "vanilla-explorer-model", "medium", "default")
    );
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
        "",
        "[agents.explorer]",
        'model = "grok-4.3"',
        'model_reasoning_effort = "medium"',
        'service_tier = "default"',
        ""
      ].join("\n")
    );
    const output = captureOutput();

    await configureAgentModelOverrides(configPath, {
      models: ["gpt-5.4-mini", "gpt-5.5", "grok-4.3"],
      readline: fakeReadline(["n", "", "", ""]), // "n" to decline bulk-accept so agent prompt and vanilla log runs
      output,
      recommendModels: true,
      persistUserOverrides: false
    });

    assert.match(
      output.lines.join("\n"),
      /Vanilla LazyCodex recommendation: vanilla-explorer-model \(reasoning: medium, tier: default\)/
    );
    assert.match(output.lines.join("\n"), /Vanilla LazyCodex service tier: default/);
    assert.match(output.lines.join("\n"), /default \(non-fast\) \(vanilla LazyCodex\)/);
    assert.match(output.lines.join("\n"), /Vanilla LazyCodex reasoning effort: medium/);
    assert.match(output.lines.join("\n"), /medium \(vanilla LazyCodex\)/);
    assert.match(readFileSync(configPath, "utf8"), /\[agents\.explorer]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given configured OMO agent when installed agent exists then shows vanilla LazyCodex fields", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-omo-vanilla-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(path.join(root, "plan.toml"), agentText("plan", "gpt-5.5", "xhigh", "default"));
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
        "",
        "[agents.plan]",
        'model = "glm-5.2"',
        'model_reasoning_effort = "xhigh"',
        'service_tier = "default"',
        ""
      ].join("\n")
    );
    const output = captureOutput();

    await configureAgentModelOverrides(configPath, {
      models: ["glm-5.2", "gpt-5.5"],
      readline: fakeReadline(["", "", ""]),
      output,
      persistUserOverrides: false
    });

    assert.match(
      output.lines.join("\n"),
      /Vanilla LazyCodex recommendation: gpt-5.5 \(reasoning: xhigh, tier: default\)/
    );
    assert.match(output.lines.join("\n"), /Vanilla LazyCodex service tier: default/);
    assert.match(output.lines.join("\n"), /Vanilla LazyCodex reasoning effort: xhigh/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given installed LazyCodex agent has no model fields then setup does not invent vanilla defaults", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-vanilla-missing-fields-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    writeFileSync(path.join(root, "explorer.toml"), 'name = "explorer"\n');
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${root}"`,
        "",
        "[agents.explorer]",
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "low"',
        'service_tier = "fast"',
        ""
      ].join("\n")
    );
    const output = captureOutput();

    await configureAgentModelOverrides(configPath, {
      models: ["gpt-5.4-mini", "gpt-5.5"],
      readline: fakeReadline(["", "", ""]),
      output,
      persistUserOverrides: false
    });

    assert.doesNotMatch(output.lines.join("\n"), /Vanilla LazyCodex recommendation/);
    assert.doesNotMatch(output.lines.join("\n"), /Vanilla LazyCodex service tier/);
    assert.doesNotMatch(output.lines.join("\n"), /Vanilla LazyCodex reasoning effort/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given TUI model selector when vanilla LazyCodex fields are available then shows and marks them before selection", async () => {
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
          agentName: "explorer",
          current: "gpt-5.4-mini",
          vanillaRecommendation: "gpt-5.5",
          vanillaRecommendationFields: {
            model: "gpt-5.5",
            model_reasoning_effort: "low",
            service_tier: "fast"
          },
          recommendationFields: {
            model: "gpt-5.4-mini",
            model_reasoning_effort: "low",
            service_tier: "fast"
          },
          choices: [
            { value: "gpt-5.4-mini", label: "gpt-5.4-mini", aliases: ["gpt-5.4-mini"], key: "gpt-5.4-mini" },
            { value: "gpt-5.5", label: "gpt-5.5", aliases: ["gpt-5.5"], key: "gpt-5.5" }
          ]
        });
        await options.tierSelector({
          agentName: "explorer",
          current: "default",
          vanillaRecommendation: "fast",
          vanillaRecommendationFields: {
            model: "gpt-5.5",
            model_reasoning_effort: "low",
            service_tier: "fast"
          },
          recommendationFields: {
            model: "gpt-5.4-mini",
            model_reasoning_effort: "low",
            service_tier: "fast"
          }
        });
        await options.reasoningSelector({
          agentName: "explorer",
          current: "medium",
          vanillaRecommendation: "low",
          vanillaRecommendationFields: {
            model: "gpt-5.5",
            model_reasoning_effort: "low",
            service_tier: "fast"
          },
          recommendationFields: {
            model: "gpt-5.4-mini",
            model_reasoning_effort: "low",
            service_tier: "fast"
          }
        });
      }
    }
  );

  assert.match(
    calls.find((call) => call[0] === "note" && call[1] === "explorer model guide")?.[2],
    /Vanilla LazyCodex recommendation: gpt-5\.5 \(reasoning: low, tier: fast\)/
  );
  assert.match(
    calls.find((call) => call[0] === "note" && call[1] === "explorer model guide")?.[2],
    /LFP recommendation: gpt-5\.4-mini \(reasoning: low, tier: fast\)/
  );
  assert.match(
    calls.find((call) => call[0] === "note" && call[1] === "explorer service tier guide")?.[2],
    /Vanilla LazyCodex recommendation: gpt-5\.5 \(reasoning: low, tier: fast\)/
  );
  assert.match(
    calls.find((call) => call[0] === "note" && call[1] === "explorer reasoning effort guide")?.[2],
    /Minimum capability: Use a cheap fast model with low reasoning and fast tier when available\./
  );
  assert.equal(calls.filter((call) => call[0] === "note" && String(call[1]).startsWith("explorer ")).length, 3);
  assert.deepEqual(
    calls.find((call) => call[0] === "select" && call[1] === "explorer model (affects this agent only)")?.[2],
    [
      { value: "gpt-5.4-mini", label: "gpt-5.4-mini (current)", hint: "current" },
      { value: "gpt-5.5", label: "gpt-5.5 (vanilla LazyCodex default)", hint: "vanilla LazyCodex" },
      { value: BACK_SELECTION, label: "Back to previous setting", hint: "return without saving this field" }
    ]
  );
  assert.deepEqual(
    calls.find((call) => call[0] === "select" && call[1] === "explorer service tier (vanilla LazyCodex: fast)")?.[2],
    [
      { value: "default", label: "default (non-fast) (current)", hint: "current" },
      { value: "fast", label: "fast (vanilla LazyCodex default)", hint: "vanilla LazyCodex" },
      { value: BACK_SELECTION, label: "Back to previous setting", hint: "return without saving this field" }
    ]
  );
  assert.deepEqual(
    calls.find((call) => call[0] === "select" && call[1] === "explorer reasoning effort (vanilla LazyCodex: low)")?.[2],
    [
      { value: "low", label: "low (vanilla LazyCodex default)", hint: "vanilla LazyCodex" },
      { value: "medium", label: "medium (current)", hint: "current" },
      { value: "high", label: "high", hint: undefined },
      { value: "xhigh", label: "xhigh", hint: undefined },
      { value: BACK_SELECTION, label: "Back to previous setting", hint: "return without saving this field" }
    ]
  );
});

function agentText(name, model, reasoning, tier) {
  return [
    `name = "${name}"`,
    `model = "${model}"`,
    `model_reasoning_effort = "${reasoning}"`,
    `service_tier = "${tier}"`,
    ""
  ].join("\n");
}

function fakeReadline(answers) {
  return {
    question(_question, resolve) {
      resolve(answers.shift() ?? "");
    }
  };
}

function captureOutput() {
  return {
    lines: [],
    log(line = "") {
      this.lines.push(line);
    }
  };
}
