import test from "node:test";
import assert from "node:assert/strict";

import { formatLazyCodexInstallCommand } from "../scripts/lazycodex-install.mjs";

test("given no install override when formatting install command then uses npx with latest dist tag", () => {
  const command = formatLazyCodexInstallCommand({});

  assert.equal(command, "npx lazycodex-ai@latest install");
});

test("given lazycodex-ai exists on PATH when formatting install command then still uses npx", () => {
  const command = formatLazyCodexInstallCommand({ PATH: "/tmp" });

  assert.equal(command, "npx lazycodex-ai@latest install");
});
