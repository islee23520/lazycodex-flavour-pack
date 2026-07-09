# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-09T03:04:32Z
**Commit:** 11da4a5
**Branch:** main

## OVERVIEW

LFP (`@islee23520/lfp`) is the **model/provider ops layer** for LazyCodex on Codex—not an agent-roster bridge. It handles install/plugin promotion, consent-gated OpenAI-compatible provider setup, saved model overrides (`CODEX_HOME/lfp.json`), category/fallback guidance, benchmarking, and sync of exactly three primary model fields into **existing** upstream agent TOMLs. LFP does not ship LFP-owned agent TOMLs.

LFP itself is MCP-free (no `.mcp.json`, no plugin tools). Optional external xAI MCP install is consent-gated and is not an LFP MCP surface.

## STRUCTURE

```text
lfp/
├── .codex-plugin/plugin.json   # Codex plugin manifest (hooks; no tools)
├── agent-configs/              # Packaged TOML SSOT (overrides, provider, categories, policies, fallback)
├── agent-overrides/            # Legacy JSON sample only (shipped; not runtime SSOT)
├── hooks/hooks.json            # SessionStart + UserPromptSubmit → scripts/*.mjs
├── scripts/                    # Thin entries → dist/src (bin + 2 hooks + smoke; + CI integration)
├── src/                        # TypeScript implementation by domain
│   ├── cli/                    # Command router, doctor reporting, delete/undo/xai-auth
│   ├── install/                # setup, plugin install/delete, snapshot/rollback, LazyCodex
│   ├── model/                  # Overrides, 3-field sync, benchmark, fallback, categories
│   ├── provider/               # OpenAI-compat provider + consent ledger
│   ├── hooks/                  # UserPromptSubmit dispatcher + category guidance
│   ├── codex/                  # Sisyphus main routing, apps tool-cache quarantine
│   ├── tui/                    # @clack setup TUI
│   ├── xai/                    # Dedicated xAI auth store (never mutates Codex host auth.json)
│   ├── skills/                 # skill-manager CLI
│   ├── smoke/                  # Isolated CODEX_HOME E2E script
│   └── utils/                  # getPackageRoot, TOML string helpers
├── dist/                       # tsc output (dist/src/**); required by scripts/*.mjs
└── test/                       # node:test + tsx; imports src/ directly
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| CLI command surface | `src/cli/cli.ts`, `package.json` | Wrapper: `scripts/cli.mjs` → `dist/src/cli/cli.js` |
| Setup orchestration | `src/install/setup-command.ts` | LazyCodex → provider consent → plugin → model → sync |
| Plugin install / promote | `src/install/codex-plugin-install.ts`, `runtime-promotion.ts` | Target: `CODEX_HOME/local-marketplaces/islee23520/plugins/lfp` as `lfp@islee23520` |
| Delete / undo | `src/install/codex-plugin-delete.ts`, `src/cli/delete-command.ts`, `undo-command.ts` | Snapshot + rollback on failure |
| Override sync (3 fields) | `src/model/sync-agent-overrides.ts` | `model`, `model_reasoning_effort`, `service_tier` only |
| Hook override sync | `src/model/sync-agent-overrides-hook.ts` | SessionStart + UserPromptSubmit path |
| UserPromptSubmit | `src/hooks/user-prompt-submit.ts` | Sync + read-only fallback/category guidance |
| Saved overrides | `src/model/user-model-overrides.ts`, `model-override-schema.ts` | Canonical: `CODEX_HOME/lfp.json` |
| Packaged defaults | `agent-configs/*.toml` | Resolved via `getPackageRoot` |
| Provider consent | `src/provider/setup-provider.ts`, `provider-consent.ts` | Ledger under `CODEX_HOME/.ledger/lfp/` |
| Model benchmark | `src/model/model-benchmark.ts` | `lfp benchmark-models` |
| xAI auth | `src/xai/`, `src/cli/xai-auth-command.ts` | Dedicated file only; never Codex `auth.json` |
| skill-manager | `src/skills/skill-manager.ts` | Cleanup wrong skill dirs |
| Package root from dist | `src/utils/package-root.ts` | dist/src → 3 up; src → 2 up |
| Runtime entries | `scripts/cli.mjs`, `isolated-smoke.mjs`, `sync-agent-overrides-hook.mjs`, `user-prompt-submit.mjs` | No business logic in wrappers |

## CODE MAP

| Symbol | Type | Location | Refs | Role |
| --- | --- | --- | --- | --- |
| `runCli` | fn | `src/cli/cli.ts` | entry | Command dispatch hub |
| `runSetup` / `runSetupLineMode` | fn | `src/install/setup-command.ts` | cli | Full setup pipeline |
| `installCodexPlugin` | fn | `src/install/codex-plugin-install.ts` | sync/setup | Marketplace copy + config enable |
| `deleteCodexPlugin` | fn | `src/install/codex-plugin-delete.ts` | delete/undo | Snapshot-safe removal |
| `syncAgentOverrides` | fn | `src/model/sync-agent-overrides.ts` | ~9 | Apply 3 primary fields to agent TOMLs |
| `applyModelOverrides` | fn | `src/model/sync-agent-overrides.ts` | sync | TOML line surgery |
| `readOverrideConfig` | fn | `src/model/model-override-config.ts` | ~15 | Override load hub |
| `configureAgentModelOverrides` | fn | `src/model/agent-model-config.ts` | ~12 | Interactive agent-config flow |
| `runOverrideSyncHook` | fn | `src/model/sync-agent-overrides-hook.ts` | hooks | Quiet hook entry |
| `runDispatcher` | fn | `src/hooks/user-prompt-submit.ts` | hook | Sync + guidance |
| `getPackageRoot` | fn | `src/utils/package-root.ts` | ~11 | Root for packaged configs |
| `PLUGIN_REF` | const | `src/install/codex-plugin-install.ts` | install/cli | `lfp@islee23520` |

## CONVENTIONS

- Source of truth: `src/`. `scripts/*.mjs` are thin re-export + side-effect import of `dist/src/**` only.
- Node ESM (`"type": "module"`). TS uses NodeNext; runtime imports use `.js` specifiers.
- Build: `npm run build` → `dist/src/**` (`rootDir: "."`). Consumers and hooks require `dist/`.
- Lint/format: Biome only (no ESLint/Prettier). Double quotes, 120 width, trailing commas none.
- Tests: `node --import tsx --test test/*.test.ts` — import `../src/...ts` directly (not `dist/`).
- Test names: `given … when … then …` (prefer over bare `it` titles).
- Single bin: `lfp`. Setup must install/register plugin before applying overrides.
- Upstream agent TOML sync: only `model`, `model_reasoning_effort`, `service_tier`. Same three for top-level `config.toml` / `ulw.config.toml` global defaults.
- UserPromptSubmit guidance is read-only except the override-sync path.
- Install writes must use snapshot + rollback (`install-transaction`, runtime promotion).
- Public entry wrappers: four runtime scripts (cli, isolated-smoke, two hooks). `scripts/ci-integration-test.mjs` is CI-only (not a product bin).

## ANTI-PATTERNS (THIS PROJECT)

- Do not reintroduce MCP config/scripts/plugin tools/`.mcp.json` into this repo.
- Do not broaden agent TOML sync beyond the three primary model fields (no “six field” contracts).
- Do not put implementation logic in `scripts/*.mjs`.
- Do not mutate upstream LazyCodex/OMO plugin cache as the durable fix; change this repo and sync.
- Do not remove legacy JSON override compatibility without full migration coverage.
- Do not make guidance hooks noisy; new trigger terms need positive + quiet tests.
- Avoid new config sources; if unavoidable, document precedence and test it.
- Do not package/install removed LFP-owned agents (`oracle`, `prometheus`, `hephaestus`, `atlas`, `sisyphus-junior`, etc.).
- Do not modify Codex host `auth.json` from LFP xAI auth paths.

## UNIQUE STYLES

- Domain folders under `src/` with no barrel `index.ts`; CLI orchestrates.
- TOML edited via regex/string helpers (`toml-string-utils`), not a full TOML parser.
- Dual test/runtime paths: unit tests → `src/`; production entries → `dist/`.
- Packaged defaults in `agent-configs/`; durable user state in `CODEX_HOME/lfp.json`.
- CI also runs `node scripts/ci-integration-test.mjs` and an MCP-surface grep on `src/`.

## COMMANDS

```bash
npm run build
npm run typecheck
npm run lint
npm test
npm run smoke:isolated
node scripts/ci-integration-test.mjs   # CI parity (needs dist/)
npm run pack:check
npm run check                          # typecheck + lint + test only (not full CI)

npx @islee23520/lfp@latest setup
npx @islee23520/lfp@latest setup --no-tui
npx @islee23520/lfp@latest dry-setup
npx @islee23520/lfp@latest doctor
npx @islee23520/lfp@latest sync
npx @islee23520/lfp@latest agent-config
npx @islee23520/lfp@latest benchmark-models
npx @islee23520/lfp@latest skill-manager --check
npx @islee23520/lfp@latest xai auth status
npx @islee23520/lfp@latest undo
npx @islee23520/lfp@latest delete
```

## NOTES

- `tsconfig` has `strict: false` / `noCheck: true` for build ergonomics; still run `typecheck` + Biome (`noExplicitAny`).
- `npm run check` is not CI-complete — add build, smoke, integration, pack:check for PR parity.
- After changing runtime/hooks: `npm run build` before smoke/CLI via `scripts/*.mjs`.
- Virtual override sections `default` / `ulw` sync to global config files, not `agents/*.toml`.
- Child docs: `src/model/AGENTS.md`, `test/AGENTS.md` (do not restate this file).
