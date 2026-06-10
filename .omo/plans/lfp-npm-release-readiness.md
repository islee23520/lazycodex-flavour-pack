# LFP Npm Release Readiness

## Scope
### Must have
- Keep the public npm command surface as one bin named `lfp` with only `setup`, `dry-setup`, and `doctor` commands.
- Preserve LFP as a lightweight overlay.
- Keep override sync scoped to `model`, `model_reasoning_effort`, and `service_tier`.
- Keep `agent-configs/` as the durable source of truth and keep `agent-overrides/omo.json` aligned for legacy callers.
- Lock the current fixes already visible on disk.
- Make the default release path portable for npm by resolving through `CODEX_HOME`.
- Prove Codex-facing setup through an isolated `CODEX_HOME` and through the packed npm tarball.
- Produce release evidence under `.omo/evidence/` and clean all artifacts.

### Must NOT have
- Do not publish to npm while `npm whoami` returns `E401` or while package-name ownership/policy is unresolved.
- Do not silently rename the npm package before a publish error proves `lfp` is blocked.
- Do not change the Codex plugin id `lfp@linalab` when npm package-name fallback is used.
- Do not broaden sync, edit upstream cache by hand, or rewrite hook trust hashes.

## TODOs

- [ ] 1. Establish release source boundary and ignore hygiene
- [x] 2. Lock current npm bin and missing-config fixes as regression gates
- [ ] 4. Harden visual hook quiet/trust-facing coverage
- [ ] 5. Add package manifest and pack-list release checks

## Final Verification Wave
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity
