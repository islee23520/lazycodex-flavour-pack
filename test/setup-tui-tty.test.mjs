import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const CLI = path.resolve("scripts/cli.mjs");
const LAZYCODEX_INSTALL_STUB = path.resolve("test/fixtures/lazycodex-install-stub.mjs");

test("given TTY setup reaches provider consent when user declines then Clack framing does not run a spinner over readline", { skip: !hasTmux() }, () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-tui-tty-"));
  const session = `lfp-tui-${path.basename(root)}`;
  try {
    const fixture = createFixture(root);
    const command = [
      "set +e",
      `cd ${shellQuote(process.cwd())}`,
      [
        `CODEX_HOME=${shellQuote(fixture.codexHome)}`,
        `LFP_LAZYCODEX_INSTALL_BIN=${shellQuote(process.execPath)}`,
        `LFP_LAZYCODEX_INSTALL_ARGS=${shellQuote(JSON.stringify([LAZYCODEX_INSTALL_STUB]))}`,
        `node ${shellQuote(CLI)} setup --config ${shellQuote(fixture.configPath)} --skip-art-prompt --skip-model-prompt`
      ].join(" "),
      "printf '\\n__LFP_STATUS__:%s\\n' \"$?\"",
      "sleep 5"
    ].join("; ");

    spawnSync("tmux", ["new-session", "-d", "-s", session, command]);
    sleep(500);
    spawnSync("tmux", ["send-keys", "-t", session, "Enter"]);
    sleep(500);
    spawnSync("tmux", ["send-keys", "-t", session, "n", "Enter"]);
    const transcript = stripAnsi(waitForTranscript(session, /__LFP_STATUS__:0/));

    const configText = readFileSync(path.join(fixture.codexHome, "config.toml"), "utf8");

    assert.match(transcript, /LFP setup/);
    assert.match(transcript, /Continue with LFP setup/);
    assert.match(transcript, /Install OpenAI-compatible model provider openai-compatible/);
    assert.doesNotMatch(transcript, /Applying LFP overlay/);
    assert.doesNotMatch(transcript, /◒/);
    assert.match(transcript, /Enabled lfp@islee23520/);
    assert.equal(existsSync(path.join(fixture.codexHome, "local-marketplaces", "islee23520", "plugins", "lfp")), true);
    assert.doesNotMatch(configText, /\[model_providers\.openai-compatible]/);
  } finally {
    spawnSync("tmux", ["kill-session", "-t", session]);
    rmSync(root, { recursive: true, force: true });
  }
});

function createFixture(root) {
  const codexHome = path.join(root, "codex-home");
  const agentsDir = path.join(root, "agents");
  const configPath = path.join(root, "config.json");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(path.join(agentsDir, "explorer.toml"), 'name = "explorer"\nmodel = "gpt-5.4-mini"\n');
  writeFileSync(
    configPath,
    JSON.stringify({
      source: { agentsDir },
      overrides: { explorer: { model: "grok-4.3" } }
    })
  );
  return { codexHome, configPath };
}

function hasTmux() {
  return spawnSync("tmux", ["-V"], { encoding: "utf8" }).status === 0;
}

function waitForTranscript(session, pattern) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = spawnSync("tmux", ["has-session", "-t", session]);
    if (result.status !== 0) break;
    const capture = spawnSync("tmux", ["capture-pane", "-t", session, "-p", "-S", "-200"], { encoding: "utf8" });
    if (pattern.test(capture.stdout)) return capture.stdout;
    sleep(250);
  }
  const capture = spawnSync("tmux", ["capture-pane", "-t", session, "-p", "-S", "-200"], { encoding: "utf8" });
  throw new Error(`tmux transcript did not match ${pattern}:\n${capture.stdout}`);
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
