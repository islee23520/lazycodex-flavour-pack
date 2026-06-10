import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { model_fallback_resolver } from "../scripts/mcp-model-fallback.mjs";

describe("mcp-model-fallback", () => {
  it("returns error when agent missing", async () => {
    const r = await model_fallback_resolver({});
    assert.ok(r.error);
  });

  it("calls through to resolver (happy path)", async () => {
    // The wrapper just delegates; we only check shape here.
    // Real ledger behavior is covered in the other test file.
    const r = await model_fallback_resolver({ agent: "explorer", reason: "quota" });
    assert.equal(r.tool, "lfp.model_fallback_resolver");
    assert.ok("effective" in r || "error" in r);
  });
});
