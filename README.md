# LFP

LazyCodex extension plugin for **model/provider operations** on Codex.

LazyCodex is the OMO Light edition for Codex. LFP does **not** own agent behavior or ship agent TOMLs. Upstream LazyCodex/OMO owns agents; LFP installs/enables this plugin, optionally configures an OpenAI-compatible provider (consent-gated), saves routing choices to `~/.codex/lfp.json`, applies exactly three primary model fields (`model`, `model_reasoning_effort`, `service_tier`) to existing agent TOMLs and optional global defaults, and emits read-only category/fallback guidance.

Repository and LFP issues live at <https://github.com/islee23520/lazycodex-flavour-pack>. Failures caused by upstream LazyCodex/OMO behavior belong on the upstream tracker.

`lfp setup` runs `npx lazycodex-ai@latest install` before applying LFP. It validates the configured `agentsDir` before writing install files and can auto-generate model recommendations from provider `/v1/models` when the active provider is queryable.

Local development uses the checkout directly: `npm run setup` runs the LazyCodex preinstall step, then installs this tree into `CODEX_HOME/local-marketplaces/islee23520/plugins/lfp`. Use `node scripts/cli.mjs setup --skip-lazycodex-install` only when intentionally testing local files without reinstalling LazyCodex first.

OpenAI-compatible provider setup is consent-gated. Interactive setup asks before writing a model provider into Codex config and records the answer under `CODEX_HOME/.ledger/lfp/`. Non-interactive setup skips provider installation unless consent was already recorded.

## Contents

- `scripts/cli.mjs` — public bin entry → `dist/src/cli/cli.js`
- `scripts/sync-agent-overrides-hook.mjs` / `user-prompt-submit.mjs` — Codex hooks
- `src/model/sync-agent-overrides.ts` — three-primary-field applier for existing OMO/LazyCodex agents
- `agent-configs/omo-agent-model-overrides.toml` — packaged default seed before `~/.codex/lfp.json` exists
- `agent-configs/lfp-categories.toml` — category guidance keywords/models
- `agent-configs/lfp-role-policies.toml` — role recommendation policies
- `agent-configs/lfp-fallback-chains.toml` / `lfp-runtime-fallback.toml` — guidance/resolver config (not written into agent TOMLs)
- `agent-configs/codex-openai-compat-provider.toml` — provider template for consent install
- `agent-overrides/omo.json` — legacy JSON sample for older callers (not runtime SSOT)

Legacy LFP-owned agent TOMLs (`oracle`, `prometheus`, `hephaestus`, `atlas`, `sisyphus-junior`, …) are **not** shipped. Setup/sync prune them from older installs.

## Commands

```sh
npx @islee23520/lfp@latest setup
npx @islee23520/lfp@latest setup --no-tui
npx @islee23520/lfp@latest dry-setup
npx @islee23520/lfp@latest delete
npx @islee23520/lfp@latest undo
npx @islee23520/lfp@latest doctor
npx @islee23520/lfp@latest sync
npx @islee23520/lfp@latest agent-config
npx @islee23520/lfp@latest benchmark-models
npx @islee23520/lfp@latest skill-manager --check
npx @islee23520/lfp@latest xai auth status

npm test
npm run setup
npm run dry-setup
npm run delete
npm run undo
npm run doctor
npm run sync
npm run agent-config
npm run global-cli
npm run smoke:isolated
```

`setup` installs/enables LFP under `CODEX_HOME/local-marketplaces/islee23520/plugins/lfp`, prunes obsolete LFP-owned helper agent TOMLs from older installs, and applies configured model-field overrides to **existing** upstream agents. Agent TOML sync is limited to the three primary model fields; global default sync uses the same three fields for top-level `config.toml` and `ulw.config.toml` unless `--agent-models-only`.

The canonical user config is `${CODEX_HOME}/lfp.json` (`schemaVersion: 2`) with `source`, `overrides`, and `rolePolicies`. Setup and `agent-config` create or update this file; `benchmark-models --apply` can write winning model fields back to the same path.

Fallback model guidance is available for saved override configurations that include fallback fields. Installed Codex agent TOMLs receive primary model fields only.

Interactive terminals get a Clack setup shell framing the same setup work. Non-interactive setup, `dry-setup`, and `doctor` stay line-output. Use `setup --no-tui` to force line mode in a TTY.

Interactive model setup covers Default Codex, ULW, and configured LazyCodex/OMO agents from the override seed / installed agents. Each model, reasoning-effort, and service-tier prompt shows scope, current value, vanilla LazyCodex recommendation where available, LFP recommendation where one exists, and a short role guide. TUI options mark `(current)` and `(vanilla LazyCodex default)`. Enter keeps the shown value; **Back** revisits the previous field or section. Line mode accepts `b`, `back`, `:back`, or `previous`. Use `--skip-model-prompt` for non-guided setup.

When interactive model setup changes overrides, LFP saves `${CODEX_HOME}/lfp.json`. On later interactive `setup` runs, LFP can ask whether to adjust saved settings; **no** keeps them without re-prompting. Older ledger/JSON/TOML copies migrate into the canonical JSON path automatically.

`sync` runs LazyCodex install first, reinstalls LFP, selects the Sisyphus main model from the OMO Sisyphus guide against the active provider inventory, then applies `${CODEX_HOME}/lfp.json` to `${CODEX_HOME}/agents/*.toml` without prompting. `agent-config` runs the model selector without reinstalling the plugin.

`npm run global-cli` builds the local checkout and installs the global `lfp` command.

Role recommendation defaults live in `agent-configs/lfp-role-policies.toml`. Canonical overrides live in `${CODEX_HOME}/lfp.json` under `rolePolicies` when present. Legacy sidecar `${CODEX_HOME}/lfp/lfp-role-policies.toml` still works for now.

`dry-setup` previews pending writes. `delete` removes the installed LFP plugin runtime and LFP marketplace/plugin config tables; it preserves LazyCodex/OMO state, provider config, and `${CODEX_HOME}/lfp.json`. `undo` re-runs LazyCodex install to restore upstream files, removes LFP-managed plugin surfaces, removes saved `lfp.json`, and removes global model defaults only when they still match the saved LFP override. `doctor` reports plugin install state, upstream readiness, provider status, categories/runtime fallback config, and pending override work.

`smoke:isolated` runs setup, saved override restore, override sync, doctor, and Codex Apps cache cleanup against a temporary `CODEX_HOME`; it does not touch the real Codex install.

LFP guidance hooks stay lightweight. The override sync path is the only path that mutates agent TOMLs (three primary fields); fallback/category guidance is read-only.

Packaged override configs resolve `${CODEX_HOME}` at runtime across home directories and custom Codex homes.

## Publish

GitHub Actions publish automation lives at `.github/workflows/publish.yml`. It runs on GitHub `release published` and can also be started with `workflow_dispatch`.

The workflow verifies the package, then publishes with `npm publish --provenance --access public`.

### Required npm publishing setup

Configure npm trusted publishing for `@islee23520/lfp` against this GitHub Actions workflow. Token-based publishing is intentionally not used.

If using npm Trusted Publishing:

- Package: `@islee23520/lfp`
- Repository: `islee23520/lazycodex-flavour-pack`
- Workflow file: `publish.yml`

```sh
npm trust github @islee23520/lfp --repo islee23520/lazycodex-flavour-pack --file publish.yml
```

After auth is configured, publish by creating a GitHub release or manually running the workflow.
