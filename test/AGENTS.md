# test — unit and integration coverage

**Parent:** root `AGENTS.md`. Do not restate package-wide rules.

## OVERVIEW

Flat Node built-in test suite (`node:test` + `tsx`) that imports TypeScript from `src/` directly. Complements dist-only smoke/CI scripts.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| CLI integration | `cli.test.ts` | Largest file; spawn `scripts/cli.mjs` |
| Override sync | `sync-agent-overrides.test.ts` | 3-field TOML surgery |
| Agent-config UX | `agent-model-config.test.ts`, `setup-tui*.test.ts` | Prompts / TUI / scopes |
| User config migrate | `user-model-overrides.test.ts` | `lfp.json` + legacy paths |
| Package contracts | `package-metadata.test.ts`, `lfp-owned-agents.test.ts` | No MCP surface; no removed agents |
| Hooks | `user-prompt-submit.test.ts`, `sync-agent-overrides-hook.test.ts`, `category-guidance-hook.test.ts` | Quiet vs emit |
| Provider / install | `codex-plugin-install.test.ts`, `codex-provider-install.test.ts`, `provider-consent.test.ts` | Consent + plugin state |
| Fallback cluster | `model-fallback-*.test.ts`, `runtime-fallback-engine.test.ts`, `fallback-chains.test.ts` | Resolver + chains |
| Smoke harness | `isolated-smoke.test.ts` | Invokes `scripts/isolated-smoke.mjs` |
| LazyCodex stub | `fixtures/lazycodex-install-stub.mjs` | Via `LFP_LAZYCODEX_INSTALL_*` env |

## CONVENTIONS

- Import: `from "../src/<domain>/<file>.ts"` (`.ts` suffix; never `dist/`).
- Assert: `node:assert/strict`. Prefer `test("given … when … then …", …)`.
- Isolate: `mkdtempSync` + temp `CODEX_HOME`; restore env in `finally`.
- CLI tests: `spawnSync` on `scripts/cli.mjs` (needs prior `npm run build` for dist-backed paths).
- Only top-level `test/*.test.ts` is picked up by `npm test` (no nested globs).

## ANTI-PATTERNS

- Do not require a shared test helper layer without need (repo has none).
- Do not leave `test.only` / `test.skip`.
- Do not assert against real user `~/.codex` — always temp homes.
- Prefer given/when/then titles even inside rare `describe`/`it` files.

## NOTES

- Full CI also runs `npm run smoke:isolated` and `node scripts/ci-integration-test.mjs` (not part of `npm test`).
- `describe`/`it` used in a couple of files; still prefer given/when/then strings.
