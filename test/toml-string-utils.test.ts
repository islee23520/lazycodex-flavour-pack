import assert from "node:assert/strict";
import test from "node:test";

import { escapeRegExp, getTableBlock, readTomlString, readTopLevelTomlString } from "../src/utils/toml-string-utils.ts";

test("given regex special characters when escaping then every metacharacter is literal", () => {
  const value = ".*+?^${}()|[]\\";

  assert.equal(escapeRegExp(value), "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
  assert.match(value, new RegExp(`^${escapeRegExp(value)}$`));
});

test("given TOML text when reading a present string key then returns the value", () => {
  assert.equal(readTomlString('model = "gpt-5.5"', "model"), "gpt-5.5");
});

test("given TOML text when reading a missing string key then returns null", () => {
  assert.equal(readTomlString('model = "gpt-5.5"', "service_tier"), null);
});

test("given multiline TOML text when reading a string key then returns the matching line value", () => {
  const text = ['model = "gpt-5.5"', 'service_tier = "default"'].join("\n");

  assert.equal(readTomlString(text, "service_tier"), "default");
});

test("given TOML text when extracting an existing table then returns only that table body", () => {
  const text = ['before = "ignored"', "[provider]", 'id = "openai"', "", "[other]", 'id = "other"'].join("\n");

  assert.equal(getTableBlock(text, "provider"), 'id = "openai"\n');
});

test("given TOML text when extracting a missing table then returns an empty string", () => {
  assert.equal(getTableBlock('[provider]\nid = "openai"\n', "missing"), "");
});

test("given TOML text when extracting a table at end of file then returns the trailing table body", () => {
  const text = ["[first]", 'id = "first"', "[provider]", 'id = "openai"'].join("\n");

  assert.equal(getTableBlock(text, "provider"), 'id = "openai"');
});

test("given top-level TOML key before sections when reading top-level string then returns the value", () => {
  const text = ['model_provider = "openai"', "", "[model_providers.openai]", 'base_url = "https://example.test"'].join(
    "\n"
  );

  assert.equal(readTopLevelTomlString(text, "model_provider"), "openai");
});

test("given TOML key after sections when reading top-level string then returns null", () => {
  const text = ["[model_providers.openai]", 'model_provider = "openai"'].join("\n");

  assert.equal(readTopLevelTomlString(text, "model_provider"), null);
});
