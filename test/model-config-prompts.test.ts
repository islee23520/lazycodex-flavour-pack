import assert from "node:assert/strict";
import test from "node:test";

import {
  groupModelAliases,
  logAgentGuide,
  printModelChoices,
  promptForModel,
  promptForYesNo
} from "../src/model/model-config-prompts.ts";

test("given provider-prefixed model aliases when grouping then displays one choice per underlying model", () => {
  const output = captureOutput();

  const groups = groupModelAliases(["openai/gpt-5.5", "github-copilot/gpt-5.5", "gpt-5.4-mini", "opencode/gpt-5.5"]);
  printModelChoices(["openai/gpt-5.5", "github-copilot/gpt-5.5", "gpt-5.4-mini", "opencode/gpt-5.5"], output);

  assert.deepEqual(
    groups.map((group) => [group.key, group.value]),
    [
      ["gpt-5.5", "openai/gpt-5.5"],
      ["gpt-5.4-mini", "gpt-5.4-mini"]
    ]
  );
  assert.match(
    output.lines.join("\n"),
    /gpt-5\.5 \(aliases: github-copilot\/gpt-5\.5, openai\/gpt-5\.5, opencode\/gpt-5\.5\)/
  );
  assert.match(output.lines.join("\n"), /Available models \(enter number or exact model id\):/);
});

test("given grouped model aliases when selecting by group then returns representative available model id", async () => {
  const selected = await promptForModel(fakeReadline(["2"]), {
    current: "gpt-5.4-mini",
    models: ["gpt-5.4-mini", "github-copilot/gpt-5.5", "openai/gpt-5.5"],
    output: silentOutput()
  });

  assert.equal(selected, "openai/gpt-5.5");
});

test("given TUI model selector when choosing model then returns selected value without readline", async () => {
  const selected = await promptForModel(readlineShouldNotRun(), {
    current: "gpt-5.4-mini",
    models: ["gpt-5.4-mini", "github-copilot/gpt-5.5", "openai/gpt-5.5"],
    output: silentOutput(),
    modelSelector: async ({ agentName, current, choices }) => {
      assert.equal(agentName, undefined);
      assert.equal(current, "gpt-5.4-mini");
      assert.deepEqual(
        choices.map((choice) => choice.label),
        ["gpt-5.4-mini", "gpt-5.5 (aliases: github-copilot/gpt-5.5, openai/gpt-5.5)"]
      );
      return "openai/gpt-5.5";
    }
  });

  assert.equal(selected, "openai/gpt-5.5");
});

test("given LazyCodex override prompt prefers current when logging guide then does not push role guide model", () => {
  const output = captureOutput();

  logAgentGuide(
    output,
    "metis",
    { model: "custom-metis-model", reasoning: "high", tier: "default" },
    { preferCurrent: true }
  );

  const text = output.lines.join("\n");
  assert.match(text, /Current: custom-metis-model/);
  assert.match(text, /Default: keep the current LazyCodex\/OMO value/);
  assert.doesNotMatch(text, /Guide: gpt-5\.5/);
});

function fakeReadline(answers) {
  return {
    question(_question, resolve) {
      resolve(answers.shift() ?? "");
    }
  };
}

function readlineShouldNotRun() {
  return {
    question() {
      throw new Error("readline should not run when TUI model selector is available");
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

function silentOutput() {
  return { log() {} };
}

test("given promptForYesNo with defaultYes:true when empty answer then returns true", async () => {
  const rl = {
    question(_question, resolve) {
      resolve("");
    }
  };
  const result = await promptForYesNo(
    rl,
    "Apply recommended models for all configured agent roles? [Y/n] (default/ulw still prompted; back = full manual): ",
    {
      defaultYes: true
    }
  );
  assert.equal(result, true);
});

test("given promptForYesNo with defaultYes:false when empty answer then returns false", async () => {
  const rl = {
    question(_question, resolve) {
      resolve("");
    }
  };
  const result = await promptForYesNo(rl, "Test? [y/N]: ", { defaultYes: false });
  assert.equal(result, false);
});

test("given promptForYesNo with yesNoSelector and defaultYes then passes defaultYes to selector", async () => {
  let receivedOpts = null;
  const yesNoSelector = async (opts) => {
    receivedOpts = opts;
    return true;
  };
  await promptForYesNo(null, "Bulk question?", { yesNoSelector, defaultYes: true });
  assert.equal(receivedOpts.defaultYes, true);
  assert.equal(receivedOpts.question, "Bulk question?");
});
