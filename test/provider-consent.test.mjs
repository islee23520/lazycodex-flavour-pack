import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { getProviderConsentPath, readProviderConsent, saveProviderConsent } from "../scripts/provider-consent.mjs";

test("given no recorded provider consent when reading consent then returns null", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-consent-"));
  try {
    const consent = readProviderConsent({ env: { CODEX_HOME: path.join(root, "codex-home") } });

    assert.equal(consent, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("given provider consent is saved when reading consent then returns saved decision", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lfp-provider-consent-"));
  try {
    const env = { CODEX_HOME: path.join(root, "codex-home") };
    const consentPath = saveProviderConsent(false, { env });
    const text = readFileSync(consentPath, "utf8");

    assert.equal(consentPath, getProviderConsentPath({ env }));
    assert.equal(readProviderConsent({ env }), false);
    assert.match(text, /"installOpenAiCompatProvider": false/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
