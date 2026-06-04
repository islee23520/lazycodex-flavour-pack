import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const packageJson = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));

test("given npm package metadata when validating bin entries then publish-safe targets exist", () => {
  assert.equal(typeof packageJson.bin, "object");

  for (const [name, target] of Object.entries(packageJson.bin)) {
    assert.match(name, /^[a-z0-9._-]+$/i);
    assert.equal(target.startsWith("./"), false, `bin target for ${name} must not start with ./`);
    assert.equal(path.isAbsolute(target), false, `bin target for ${name} must be package-relative`);
    assert.equal(existsSync(path.resolve(target)), true, `bin target for ${name} must exist`);
  }
});
