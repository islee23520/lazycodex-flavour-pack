import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { configureAgentModelOverrides } from "../src/model/agent-model-config.ts";
import { runSetupTui } from "../src/tui/setup-tui.ts";

test("given line setup model prompts when configuring defaults and agents then explains what each setting affects", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-scope-ux-"));
  try {
    const configPath = path.join(root, "overrides.toml");
    mkdirSync(path.join(root, "agents"));
    writeFileSync(
      configPath,
      [
        "[source]",
        `agents_dir = "${path.join(root, "agents")}"`,
        "",
        "[agents.default]",
        'model = "gpt-5.5"',
        'model_reasoning_effort = "high"',
        'service_tier = "default"',
        "",
        "[agents.ulw]",
        'model = "gpt-5.5"',
        'model_reasoning_effort = "xhigh"',
        'service_tier = "default"',
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
      readline: fakeReadline(["", "", "", "", "", "", "", "", ""]),
      output,
      confirmConfiguredValues: true,
      persistUserOverrides: false
    });

    const text = output.lines.join("\n");
    assert.match(text, /Affects: normal Codex sessions via CODEX_HOME\/config\.toml/);
    assert.match(text, /Affects: ultrawork runs via CODEX_HOME\/ulw\.config\.toml/);
    assert.match(text, /Affects: only the explorer agent when that agent is invoked/);
    assert.match(text, /Role guide: Default Codex sessions\./);
    assert.match(text, /Role guide: Ultrawork planning and long-form execution\./);
    assert.match(text, /Role guide: Fast codebase search and file discovery\./);
    assert.match(text, /Minimum capability: Use a cheap fast model with low reasoning and fast tier when available\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given TUI model selector when choosing default ULW and agent models then labels the affected scope", async () => {
  const calls = [];
  const prompts = {
    intro: (message) => calls.push(["intro", message]),
    note: (message, title) => calls.push(["note", title, message]),
    confirm: async () => true,
    select: async (options) => {
      calls.push(["select", options.message]);
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
        for (const [agentName, displayName] of [
          ["default", "Default Codex"],
          ["ulw", "ULW"],
          ["explorer", "Explorer"]
        ]) {
          await options.modelSelector({
            agentName,
            displayName,
            current: "gpt-5.5",
            choices: [{ value: "gpt-5.5", label: "gpt-5.5", aliases: ["gpt-5.5"], key: "gpt-5.5" }]
          });
        }
      }
    }
  );

  assert.ok(calls.some((call) => call[1] === "Default Codex model (affects normal Codex sessions)"));
  assert.ok(calls.some((call) => call[1] === "ULW model (affects ultrawork runs)"));
  assert.ok(calls.some((call) => call[1] === "Explorer model (affects this agent only)"));
});

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
