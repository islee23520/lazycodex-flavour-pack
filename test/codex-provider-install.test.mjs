import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

import { installCodexPlugin } from "../scripts/codex-plugin-install.mjs";

const CLI = path.resolve("scripts/cli.mjs");
const LAZYCODEX_INSTALL_STUB = path.resolve("test/fixtures/lazycodex-install-stub.mjs");

test("given setup runs noninteractively with empty Codex config when provider is missing then skips provider install", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-"));
  try {
    const fixture = createFixture(root);

    const result = runCli(["setup", "--config", fixture.configPath], fixture.codexHome);
    const codexConfig = readFileSync(path.join(fixture.codexHome, "config.toml"), "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /model provider missing; skipping provider install in non-interactive mode/);
    assert.doesNotMatch(codexConfig, /^model_provider = "openai-compatible"$/m);
    assert.doesNotMatch(codexConfig, /^\[model_providers\.openai-compatible\]$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given package provider config changes when setup runs then OpenAI-compatible provider values come from config file", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const packageRoot = createPackageRoot(root, {
      id: "localproxy",
      baseUrl: "https://localproxy.example.test/v1",
      wireApi: "chat",
      requiresOpenAiAuth: false
    });

    const state = installCodexPlugin(packageRoot, {
      env: { ...process.env, CODEX_HOME: codexHome },
      installOpenAiCompatProvider: true
    });
    const codexConfig = readFileSync(path.join(codexHome, "config.toml"), "utf8");

    assert.equal(state.openAiCompatProvider.id, "localproxy");
    assert.match(codexConfig, /^model_provider = "localproxy"$/m);
    assert.match(codexConfig, /^\[model_providers\.localproxy\]$/m);
    assert.match(codexConfig, /^base_url = "https:\/\/localproxy\.example\.test\/v1"$/m);
    assert.match(codexConfig, /^wire_api = "chat"$/m);
    assert.match(codexConfig, /^requires_openai_auth = false$/m);
    assert.doesNotMatch(codexConfig, /api\.openai\.com/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given Codex config has user model provider when setup runs then leaves provider config untouched", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-"));
  try {
    const fixture = createFixture(root);
    mkdirSync(fixture.codexHome, { recursive: true });
    writeFileSync(
      path.join(fixture.codexHome, "config.toml"),
      ['model_provider = "custom-local"', "", "[projects.\"/tmp/example\"]", 'trust_level = "trusted"', ""].join("\n")
    );

    const result = runCli(["setup", "--config", fixture.configPath], fixture.codexHome);
    const codexConfig = readFileSync(path.join(fixture.codexHome, "config.toml"), "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.match(codexConfig, /^model_provider = "custom-local"$/m);
    assert.doesNotMatch(codexConfig, /^model_provider = "openai-compatible"$/m);
    assert.doesNotMatch(codexConfig, /^\[model_providers\.openai-compatible\]$/m);
    assert.match(codexConfig, /^\[projects\."\/tmp\/example"\]$/m);
    assert.match(codexConfig, /^trust_level = "trusted"$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given doctor sees missing optional OpenAI-compatible provider when run then exits cleanly", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-"));
  try {
    const fixture = createFixture(root);

    const setup = runCli(["setup", "--config", fixture.configPath], fixture.codexHome);
    const doctor = runCli(["doctor", "--config", fixture.configPath], fixture.codexHome);

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /OpenAI-compatible provider: missing \(openai-compatible\)/);
    assert.match(doctor.stdout, /active model provider: missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given doctor sees configured OpenAI-compatible provider with user active provider when run then exits cleanly", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-"));
  try {
    const fixture = createFixture(root);
    mkdirSync(fixture.codexHome, { recursive: true });
    writeFileSync(path.join(fixture.codexHome, "config.toml"), 'model_provider = "custom-local"\n');

    const setup = runCli(["setup", "--config", fixture.configPath], fixture.codexHome);
    const doctor = runCli(["doctor", "--config", fixture.configPath], fixture.codexHome);

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /OpenAI-compatible provider: missing \(openai-compatible\)/);
    assert.match(doctor.stdout, /active model provider: user-managed \(custom-local\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given dry setup sees missing OpenAI-compatible provider when run then does not schedule provider install", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-"));
  try {
    const fixture = createFixture(root);

    const result = runCli(["dry-setup", "--config", fixture.configPath], fixture.codexHome);

    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /would configure OpenAI-compatible provider openai-compatible/);
    assert.equal(existsSync(path.join(fixture.codexHome, "config.toml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given doctor sees OpenAI-compatible provider drift when run then reports provider setup issue", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-"));
  try {
    const fixture = createFixture(root);
    writeDriftedCodexConfig(fixture.codexHome);

    const result = runCli(["doctor", "--config", fixture.configPath], fixture.codexHome);
    const codexConfig = readFileSync(path.join(fixture.codexHome, "config.toml"), "utf8");

    assert.equal(result.status, 1);
    assert.match(result.stdout, /OpenAI-compatible provider: drifted \(openai-compatible\)/);
    assert.match(codexConfig, /https:\/\/example\.invalid\/v1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given doctor sees missing optional OpenAI-compatible provider when run then reports it without failing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-"));
  try {
    const fixture = createFixture(root);
    const setup = runCli(["setup", "--config", fixture.configPath], fixture.codexHome);
    const doctor = runCli(["doctor", "--config", fixture.configPath], fixture.codexHome);

    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(doctor.status, 0);
    assert.match(doctor.stdout, /OpenAI-compatible provider: missing \(openai-compatible\)/);
    assert.match(doctor.stdout, /active model provider: missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("given setup sees OpenAI-compatible provider drift when run then exits nonzero without overwriting", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-"));
  try {
    const fixture = createFixture(root);
    writeDriftedCodexConfig(fixture.codexHome);

    const result = runCli(["setup", "--config", fixture.configPath], fixture.codexHome);
    const codexConfig = readFileSync(path.join(fixture.codexHome, "config.toml"), "utf8");

    assert.equal(result.status, 1);
    assert.match(result.stdout, /OpenAI-compatible provider: drifted \(openai-compatible\)/);
    assert.match(codexConfig, /https:\/\/example\.invalid\/v1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createFixture(root) {
  const codexHome = path.join(root, "codex-home");
  const sourceDir = path.join(root, "agents");
  const configPath = path.join(root, "config.json");
  mkdirSync(sourceDir);
  writeFileSync(path.join(sourceDir, "explorer.toml"), 'name = "explorer"\nmodel = "grok-4.3"\n');
  writeFileSync(
    configPath,
    JSON.stringify({
      source: { agentsDir: sourceDir },
      overrides: { explorer: { model: "grok-4.3" } }
    })
  );
  return { codexHome, configPath };
}

function createPackageRoot(root, provider) {
  const packageRoot = path.join(root, "package-root");
  mkdirSync(path.join(packageRoot, ".codex-plugin"), { recursive: true });
  mkdirSync(path.join(packageRoot, "agent-configs"), { recursive: true });
  mkdirSync(path.join(packageRoot, "hooks"), { recursive: true });
  mkdirSync(path.join(packageRoot, "scripts"), { recursive: true });
  writeFileSync(path.join(packageRoot, ".codex-plugin", "plugin.json"), '{"hooks":"./hooks/hooks.json"}\n');
  writeFileSync(path.join(packageRoot, "hooks", "hooks.json"), '{"hooks":{}}\n');
  writeFileSync(path.join(packageRoot, "README.md"), "# fixture\n");
  writeFileSync(path.join(packageRoot, "package.json"), "{}\n");
  writeFileSync(path.join(packageRoot, "agent-configs", "visual-engineering.toml"), 'name = "visual-engineering"\nmodel = "gemini-pro-agent"\n');
  writeFileSync(path.join(packageRoot, "agent-configs", "visual-looker.toml"), 'name = "visual-looker"\nmodel = "gemini-pro-agent"\n');
  writeFileSync(path.join(packageRoot, "agent-configs", "artistry.toml"), 'name = "artistry"\nmodel = "gemini-pro-agent"\n');
  writeFileSync(path.join(packageRoot, "agent-configs", "artistry-gen.toml"), 'name = "artistry-gen"\nmodel = "gemini-pro-agent"\n');
  writeFileSync(path.join(packageRoot, "agent-configs", "artistry-qa.toml"), 'name = "artistry-qa"\nmodel = "gemini-pro-agent"\n');
  writeFileSync(path.join(packageRoot, "agent-configs", "sisyphus.toml"), 'name = "sisyphus"\nmodel = "grok-4.20-0309-reasoning"\n');
  writeFileSync(
    path.join(packageRoot, "agent-configs", "codex-openai-compat-provider.toml"),
    [
      "[provider]",
      `id = ${JSON.stringify(provider.id)}`,
      `base_url = ${JSON.stringify(provider.baseUrl)}`,
      `wire_api = ${JSON.stringify(provider.wireApi)}`,
      `requires_openai_auth = ${provider.requiresOpenAiAuth}`,
      ""
    ].join("\n")
  );
  return packageRoot;
}

function writeDriftedCodexConfig(codexHome) {
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(
    path.join(codexHome, "config.toml"),
    [
      'model_provider = "openai-compatible"',
      "",
      "[model_providers.openai-compatible]",
      'base_url = "https://example.invalid/v1"',
      'wire_api = "responses"',
      "requires_openai_auth = true",
      ""
    ].join("\n")
  );
}

function runCli(args, codexHome) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      LFP_LAZYCODEX_INSTALL_BIN: process.execPath,
      LFP_LAZYCODEX_INSTALL_ARGS: JSON.stringify([LAZYCODEX_INSTALL_STUB])
    },
    encoding: "utf8"
  });
}

test("given noninteractive setup with provider env vars when api key env is missing then fails with validation message", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-ni-"));
  try {
    const fixture = createFixture(root);
    const result = spawnSync(process.execPath, [CLI, "setup", "--config", fixture.configPath, "--skip-lazycodex-install"], {
      env: {
        ...process.env,
        CODEX_HOME: fixture.codexHome,
        LFP_PROVIDER_ID: "localproxy",
        LFP_PROVIDER_BASE_URL: "https://localproxy.example/v1",
        LFP_PROVIDER_WIRE_API: "responses"
      },
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LFP_PROVIDER_API_KEY_ENV|provider-api-key-env|required/i);
    assert.equal(existsSync(path.join(fixture.codexHome, "config.toml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given noninteractive setup with full provider env vars when env key exists then writes env_key without secret", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-ni-"));
  try {
    const fixture = createFixture(root);
    const result = spawnSync(process.execPath, [CLI, "setup", "--config", fixture.configPath], {
      env: {
        ...process.env,
        CODEX_HOME: fixture.codexHome,
        LFP_LAZYCODEX_INSTALL_BIN: process.execPath,
        LFP_LAZYCODEX_INSTALL_ARGS: JSON.stringify([LAZYCODEX_INSTALL_STUB]),
        LFP_PROVIDER_ID: "localproxy",
        LFP_PROVIDER_BASE_URL: "https://localproxy.example/v1",
        LFP_PROVIDER_WIRE_API: "responses",
        LFP_PROVIDER_API_KEY_ENV: "LOCALPROXY_API_KEY",
        LOCALPROXY_API_KEY: "super-secret-value"
      },
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    const codexConfig = readFileSync(path.join(fixture.codexHome, "config.toml"), "utf8");
    assert.match(codexConfig, /env_key = "LOCALPROXY_API_KEY"/);
    assert.match(codexConfig, /model_provider = "localproxy"/);
    assert.doesNotMatch(codexConfig, /super-secret-value/);
    assert.doesNotMatch(result.stdout, /super-secret-value/);
    assert.doesNotMatch(result.stderr, /super-secret-value/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given noninteractive setup with provider env vars when user-managed provider exists then skips provider install", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-ni-"));
  try {
    const fixture = createFixture(root);
    mkdirSync(fixture.codexHome, { recursive: true });
    writeFileSync(path.join(fixture.codexHome, "config.toml"), 'model_provider = "custom-local"\n');
    const result = spawnSync(process.execPath, [CLI, "setup", "--config", fixture.configPath], {
      env: {
        ...process.env,
        CODEX_HOME: fixture.codexHome,
        LFP_LAZYCODEX_INSTALL_BIN: process.execPath,
        LFP_LAZYCODEX_INSTALL_ARGS: JSON.stringify([LAZYCODEX_INSTALL_STUB]),
        LFP_PROVIDER_ID: "localproxy",
        LFP_PROVIDER_BASE_URL: "https://localproxy.example/v1",
        LFP_PROVIDER_WIRE_API: "responses",
        LFP_PROVIDER_API_KEY_ENV: "LOCALPROXY_API_KEY",
        LOCALPROXY_API_KEY: "some-key"
      },
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    const codexConfig = readFileSync(path.join(fixture.codexHome, "config.toml"), "utf8");
    assert.match(codexConfig, /^model_provider = "custom-local"$/m);
    assert.doesNotMatch(codexConfig, /\[model_providers\.localproxy\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
