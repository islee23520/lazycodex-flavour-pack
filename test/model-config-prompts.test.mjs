import test from "node:test";
import assert from "node:assert/strict";

import { groupModelAliases, logAgentGuide, printModelChoices, promptForModel } from "../scripts/model-config-prompts.mjs";

test("given provider-prefixed model aliases when grouping then displays one choice per underlying model", () => {
  const output = captureOutput();

  const groups = groupModelAliases([
    "openai/gpt-5.5",
    "github-copilot/gpt-5.5",
    "gpt-5.4-mini",
    "opencode/gpt-5.5"
  ]);
  printModelChoices(
    ["openai/gpt-5.5", "github-copilot/gpt-5.5", "gpt-5.4-mini", "opencode/gpt-5.5"],
    output
  );

  assert.deepEqual(
    groups.map((group) => [group.key, group.value]),
    [
      ["gpt-5.5", "openai/gpt-5.5"],
      ["gpt-5.4-mini", "gpt-5.4-mini"]
    ]
  );
  assert.match(output.lines.join("\n"), /gpt-5\.5 \(aliases: github-copilot\/gpt-5\.5, openai\/gpt-5\.5, opencode\/gpt-5\.5\)/);
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
