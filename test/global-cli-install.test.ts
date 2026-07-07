import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  formatGlobalCliInstallCommand,
  maybeInstallGlobalCli,
  resolveGlobalCliInstallTarget
} from "../src/install/global-cli-install.ts";

test("given non-interactive setup when global CLI flag is absent then skips npm global install", async () => {
  const calls = [];
  const result = await maybeInstallGlobalCli({}, "/tmp/lfp", {
    interactive: false,
    spawnSync: (...args) => {
      calls.push(args);
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.deepEqual(result, { installed: false, skipped: true });
  assert.deepEqual(calls, []);
});

test("given setup has global CLI flag when installing then runs npm install globally for package root", async () => {
  const calls = [];
  const result = await maybeInstallGlobalCli({ globalCli: true }, "/tmp/lfp", {
    interactive: false,
    spawnSync: (...args) => {
      calls.push(args);
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.deepEqual(result, { installed: true, skipped: false });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], "npm");
  assert.deepEqual(calls[0][1], ["install", "-g", "/tmp/lfp"]);
});

test("given interactive setup when user declines global CLI prompt then skips npm global install", async () => {
  const calls = [];
  const result = await maybeInstallGlobalCli({}, "/tmp/lfp", {
    interactive: true,
    yesNoSelector: async ({ question }) => {
      calls.push(["question", question]);
      return false;
    },
    spawnSync: (...args) => {
      calls.push(["spawn", args]);
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.deepEqual(result, { installed: false, skipped: true });
  assert.match(calls[0][1], /Install or update the global lfp CLI now/);
  assert.equal(
    calls.some((call) => call[0] === "spawn"),
    false
  );
});

test("given interactive line setup when user accepts global CLI prompt then installs through readline", async () => {
  const calls = [];
  const result = await maybeInstallGlobalCli({}, "/tmp/lfp", {
    interactive: true,
    readline: fakeReadline(["y"]),
    spawnSync: (...args) => {
      calls.push(args);
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.deepEqual(result, { installed: true, skipped: false });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ["install", "-g", "/tmp/lfp"]);
});

test("given interactive line setup when user declines global CLI prompt then skips through readline", async () => {
  const calls = [];
  const result = await maybeInstallGlobalCli({}, "/tmp/lfp", {
    interactive: true,
    readline: fakeReadline([""]),
    spawnSync: (...args) => {
      calls.push(args);
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.deepEqual(result, { installed: false, skipped: true });
  assert.deepEqual(calls, []);
});

test("given setup help needs command preview when formatting then quotes package root", () => {
  assert.equal(formatGlobalCliInstallCommand("/tmp/lfp dir"), 'npm install -g "/tmp/lfp dir"');
});

test("given package install without git checkout when resolving target then installs package version instead of cache path", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-global-package-"));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "@islee23520/lfp", version: "0.3.18" }));

    assert.equal(resolveGlobalCliInstallTarget(root), "@islee23520/lfp@0.3.18");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given local git checkout when resolving target then installs checkout path", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-global-checkout-"));
  try {
    mkdirSync(path.join(root, ".git"));
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "@islee23520/lfp", version: "0.3.18" }));

    assert.equal(resolveGlobalCliInstallTarget(root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function fakeReadline(answers) {
  return {
    question(_question, resolve) {
      resolve(answers.shift() ?? "");
    }
  };
}
