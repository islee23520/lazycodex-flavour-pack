# PROJECT KNOWLEDGE BASE

## OVERVIEW

LFP is a LazyCodex extension package for Codex. It installs and enables the local plugin runtime, configures OpenAI-compatible provider settings with consent, manages saved model overrides, applies model routing guidance, runs setup/doctor/delete/benchmark commands, and keeps upstream LazyCodex/OMO agent model fields synchronized.

LFP is MCP-free. Do not add `.mcp.json`, `mcpServers`, MCP tool scripts, or plugin tool declarations back to this repository.

## STRUCTURE

```text
lfp/
├── .codex-plugin/plugin.json       # plugin manifest and marketplace metadata
├── agent-configs/                  # source of truth for model overrides and packaged provider/policy config
├── hooks/hooks.json                # Codex hook commands pointing at scripts/*.mjs entry points
├── scripts/                        # public entry point wrappers for bin and hooks (4 files only)
├── src/                            # TypeScript runtime source, organized by domain
│   ├── cli/
│   ├── codex/
│   ├── hooks/
│   ├── install/
│   ├── model/
│   ├── provider/
│   ├── smoke/
│   ├── tui/
│   └── utils/
├── dist/                           # TypeScript build output consumed by scripts/*.mjs
├── test/                           # TypeScript test runner coverage (imports from src/ directly)
├── biome.json                      # Biome lint/format config
├── tsconfig.json                   # TypeScript config (includes src/ and test/)
├── tsconfig.build.json             # Build-only config (src/ only, excludes tests)
└── package.json                    # npm command and publish surface
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| CLI command surface | `src/cli/cli.ts` and `package.json` | Public wrapper remains `scripts/cli.mjs`. |
| Setup orchestration | `src/install/setup-command.ts` | LazyCodex install, provider consent, plugin install, model config, override sync. |
| Plugin install and promotion | `src/install/codex-plugin-install.ts` | Marketplace copy, stale-agent pruning, runtime promotion. |
| Delete command | `src/install/codex-plugin-delete.ts`, `src/cli/delete-command.ts` | Removes installed LFP plugin/config tables. |
| Hook dispatcher | `src/hooks/user-prompt-submit.ts` | Runs override sync and model fallback guidance. |
| Override sync | `src/model/sync-agent-overrides.ts` | Applies exactly three primary model fields to upstream agent TOMLs. |
| Hook override sync | `src/model/sync-agent-overrides-hook.ts` | SessionStart/UserPromptSubmit hook entry. |
| Fallback guidance | `src/model/model-fallback-guidance.ts` | Read-only guidance for quota/provider failures; no MCP tool dependency. |
| Saved fallback resolver logic | `src/model/model-fallback-resolver.ts` | Local library/CLI resolver for saved override data. |
| Provider config | `src/provider/codex-provider-config.ts`, `src/provider/setup-provider.ts` | Consent-gated provider config. |
| Model benchmark | `src/model/model-benchmark.ts` | Recommendation/benchmark command. |
| Package root helper | `src/utils/package-root.ts` | Keeps compiled `dist/src` modules resolving the repository/package root. |
| Runtime entry points | `scripts/cli.mjs`, `scripts/isolated-smoke.mjs`, `scripts/sync-agent-overrides-hook.mjs`, `scripts/user-prompt-submit.mjs` | Thin wrappers that load compiled `dist/src/`. Do not add more wrappers; tests import from `src/` directly. |

## CONVENTIONS

- Source of truth is TypeScript under `src/`. `scripts/*.mjs` are entry point wrappers (bin and hooks only) that import compiled `dist/src/**/*.js`.
- Runtime is Node ESM. Use `.js` import specifiers in TypeScript for NodeNext output.
- Build with `npm run build`; package consumers require `dist/` because entry point wrappers load it.
- Format/lint with Biome. Do not introduce ESLint or Prettier.
- Tests are TypeScript (`test/*.test.ts`) and import directly from `src/` via `tsx`. Run with `npm test`.
- Test names should follow `given ... when ... then ...`.
- The npm package exposes a single bin named `lfp`.
- Setup must install/register LFP into Codex before applying overrides. The install target is `CODEX_HOME/local-marketplaces/islee23520/plugins/lfp`, enabled as `lfp@islee23520`.
- Upstream LazyCodex/OMO agent sync is scoped to exactly three primary model fields: `model`, `model_reasoning_effort`, and `service_tier`.
- Global default sync is also scoped to those three fields for top-level `config.toml` and `ulw.config.toml`.
- UserPromptSubmit guidance is read-only except the override sync path.
- OpenAI-compatible provider setup is consent-gated and records consent under `CODEX_HOME/.ledger/lfp/`.
- Install safety is mandatory: agent/config/plugin writes must preserve snapshot and rollback behavior.

## ANTI-PATTERNS

- Do not broaden upstream agent TOML sync beyond the three primary model fields.
- Do not reintroduce MCP configuration, MCP scripts, plugin tools, or `.mcp.json`.
- Do not move implementation logic into `scripts/*.mjs`; wrappers are entry points only (bin + hooks, 4 files total).
- Do not mutate upstream LazyCodex/OMO plugin cache files as the durable fix; update this repo and run sync.
- Do not remove legacy JSON override compatibility unless every caller and migration path is covered.
- Do not make guidance hooks noisy. Add trigger terms only with positive and quiet tests.
- Avoid adding another config source. If one is unavoidable, document precedence and cover it in tests.

## COMMANDS

```bash
npm run build
npm run typecheck
npm run lint
npm test
npm run smoke:isolated
npm run pack:check

npx @islee23520/lfp@latest setup
npx @islee23520/lfp@latest setup --no-tui
npx @islee23520/lfp@latest dry-setup
npx @islee23520/lfp@latest doctor
npx @islee23520/lfp@latest agent-config
```
