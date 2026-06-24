# LFP

LazyCodex extension plugin that brings the full OMO feature set into Codex.

LazyCodex is the OMO Light edition for Codex. LFP keeps LazyCodex/OMO as the owner of agent behavior and adds the operational layer for model/provider setup, category-based model routing guidance, fallback guidance for saved override configurations, and model benchmarking.

LFP runs `npx lazycodex-ai@latest install` first, then registers this plugin in Codex, optionally configures a generic OpenAI-compatible provider only after operator consent, and writes saved model-routing choices to `~/.codex/lfp.json`. It applies only Codex-supported primary model fields (`model`, `model_reasoning_effort`, `service_tier`) to existing LazyCodex/OMO agent TOMLs plus Codex global defaults when that mode is enabled.

Repository and LFP-owned issues live at <https://github.com/islee23520/lazycodex-flavour-pack>. If a failure is caused by upstream LazyCodex/OMO behavior rather than this flavour pack, register that issue on the upstream LazyCodex tracker instead.

`lfp setup` runs `npx lazycodex-ai@latest install` before applying LFP. It validates the configured `agentsDir` before writing its own install files and auto-generates model recommendations from provider `/v1/models` when the active provider can be queried.

Local development uses the checkout directly: `npm run setup` runs the LazyCodex preinstall step, then installs files from this working tree into `CODEX_HOME/local-marketplaces/islee23520/plugins/lfp`. Use `node scripts/cli.mjs setup --skip-lazycodex-install` only when intentionally testing local files without reinstalling LazyCodex first.

OpenAI-compatible provider setup is consent-gated. In interactive setup, LFP asks before writing a model provider into Codex config and records the answer under `CODEX_HOME/.ledger/lfp/`. Non-interactive setup skips provider installation unless consent has already been recorded.

## Contents

- `scripts/sync-agent-overrides-hook.mjs`: quietly applies configured model overrides at session start and before prompt guidance.
- `src/model/sync-agent-overrides.ts`: reapplies supported three-primary-field model settings for existing LazyCodex/OMO agent targets from the configured override source.
- `agent-configs/omo-agent-model-overrides.toml`: packaged default model recommendation seed used before a user `~/.codex/lfp.json` exists.
- `agent-configs/codex-openai-compat-provider.toml`: durable provider source for Codex OpenAI-compatible setup.
- `agent-overrides/omo.json`: legacy JSON override source retained for compatibility with older script callers.

## Commands

```sh
npx @islee23520/lfp@latest setup
npx @islee23520/lfp@latest setup --no-tui
npx @islee23520/lfp@latest dry-setup
npx @islee23520/lfp@latest delete
npx @islee23520/lfp@latest doctor
npx @islee23520/lfp@latest agent-config

npm test
npm run setup
npm run dry-setup
npm run delete
npm run doctor
npm run agent-config
npm run smoke:isolated
```

`setup` installs/enables LFP under `CODEX_HOME/local-marketplaces/islee23520/plugins/lfp`, removes obsolete LFP-owned helper agent TOMLs from older installs, and applies configured model-field overrides to existing LazyCodex/OMO agent TOMLs. Agent TOML sync is limited to the three primary model fields: `model`, `model_reasoning_effort`, and `service_tier`; global default sync remains limited to the same three fields for top-level `config.toml` and `ulw.config.toml`.

The canonical user config is `${CODEX_HOME}/lfp.json` (normally `~/.codex/lfp.json`) with `schemaVersion: 2`. It stores `source`, `overrides`, and `rolePolicies` in one JSON document. Setup and `agent-config` create or update this file; `benchmark-models --apply` writes winning model fields back to this same canonical path.

Fallback model guidance is available for saved override configurations that include fallback fields. Installed Codex agent TOMLs receive primary model fields only.

Interactive terminals get a Clack setup shell with confirm/cancel framing around the same setup work. Non-interactive setup, `dry-setup`, and `doctor` keep line-output behavior. Use `setup --no-tui` to force the legacy line-output setup path in a TTY.

Interactive setup enters a single model selection flow by default, covering Default Codex, ULW, and configured LazyCodex/OMO agents. Each model, reasoning-effort, and service-tier prompt shows what the setting affects, the current OMO/LazyCodex value, the vanilla LazyCodex recommendation where available, the LFP recommendation where one exists, and a short English guide for the agent role, tuning goal, and minimum capability. TUI choices mark `(current)` and `(vanilla LazyCodex default)` directly in the option label. Pressing Enter keeps and re-applies the shown value while still allowing edits; choosing `Back to previous setting` revisits the previous field or setup section. Line mode accepts `b`, `back`, `:back`, or `previous` for the same back-navigation flow. When provider models are discoverable, setup builds recommendations from the active provider inventory automatically. Saved choices are written into `${CODEX_HOME}/lfp.json` before setup applies the overrides. Use `--skip-model-prompt` for non-guided setup.

When interactive model setup changes override values, LFP saves a schema-versioned JSON user copy at `${CODEX_HOME}/lfp.json`. On later interactive `setup` runs after an npx/package patch, LFP asks whether you want to adjust model overrides; answering no keeps the saved settings without rerunning the per-agent prompts. Answering yes loads the saved copy and continues into the model selection flow. Older `${CODEX_HOME}/lfp/omo-agent-model-overrides.json`, `${CODEX_HOME}/lfp/omo-agent-model-overrides.toml`, and `${CODEX_HOME}/.ledger/lfp/omo-agent-model-overrides.toml` copies are migrated automatically into the canonical JSON config path.

`agent-config` runs the same LFP model selector without reinstalling the plugin. It lists already-configured override targets and writes selections to `${CODEX_HOME}/lfp.json`. Agent TOML writes are restricted to the three primary model fields on existing LazyCodex/OMO targets.

Role recommendation policy defaults live in `agent-configs/lfp-role-policies.toml`. The canonical override location is `${CODEX_HOME}/lfp.json` under `rolePolicies`; when present, those values take priority. The legacy sidecar `${CODEX_HOME}/lfp/lfp-role-policies.toml` with `[policies.<role>]` sections still works for now. Model preference order stays code-managed.

`dry-setup` previews pending writes. `delete` removes the installed LFP plugin runtime and LFP marketplace/plugin config tables; it preserves LazyCodex/OMO state, provider config, and `${CODEX_HOME}/lfp.json`. `doctor` reports plugin install state, upstream LazyCodex/OMO readiness, provider status, and pending override work.

`smoke:isolated` runs setup, saved user override restore, override sync, doctor, and Codex Apps cache cleanup against a temporary `CODEX_HOME`; it does not touch the real Codex install.

LFP prompt guidance scripts stay lightweight. The override sync path is the only path that mutates agent TOMLs, applying the configured three primary agent model fields; fallback prompt guidance remains read-only and points agents at the saved fallback configuration.

The packaged override configs resolve `${CODEX_HOME}` at runtime, so the same release works across different user home directories and custom Codex homes without editing the shipped files.

## Publish

GitHub Actions publish automation lives at `.github/workflows/publish.yml`. It runs when a GitHub `release published` event fires and can also be started manually with `workflow_dispatch`.

The workflow verifies the package with `npm test` and `npm pack --dry-run`, then publishes with `npm publish --provenance --access public`.

### Required npm publishing setup

Configure npm trusted publishing for `@islee23520/lfp` against this GitHub Actions workflow. Token-based publishing is intentionally not used, so the workflow can publish with provenance without an OTP prompt.

If using npm Trusted Publishing instead of a token, configure npm for:

- Package: `@islee23520/lfp`
- Repository: `islee23520/lazycodex-flavour-pack`
- Workflow file: `publish.yml`

```sh
npm trust github @islee23520/lfp --repo islee23520/lazycodex-flavour-pack --file publish.yml
```

After auth is configured, publish by creating a GitHub release or manually running the workflow.
