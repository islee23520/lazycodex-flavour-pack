# LFP

LazyCodex extension plugin that brings the full OMO feature set into Codex.

LazyCodex is the OMO Light edition for Codex — it intentionally ships only a portable subset (rules, ultrawork, lsp, 6 core agents) because it targets GPT-only workflows. LFP bridges the rest: the complete agent roster, category-based model routing, MCP fallback resolver for saved override configurations, art team orchestration, visual specialists, provider configuration, and model benchmarking.

LFP runs `npx lazycodex-ai install` first, then registers this plugin in Codex, installs LFP-owned agents, optionally configures a generic OpenAI-compatible provider only after operator consent, and writes saved model-routing choices to `~/.codex/lfp.json`. LazyCodex-owned agents stay pure: LFP modifies only LFP-owned agent configs plus Codex global defaults when that mode is enabled.

Repository and LFP-owned issues live at <https://github.com/islee23520/lazycodex-flavour-pack>. If a failure is caused by upstream LazyCodex/OMO behavior rather than this flavour pack, register that issue on the upstream LazyCodex tracker instead.

`lfp setup` runs `npx lazycodex-ai install` before applying LFP. It validates the configured `agentsDir` before writing its own install files and auto-generates model recommendations from provider `/v1/models` when the active provider can be queried.

Local development uses the checkout directly: `npm run setup` runs the LazyCodex preinstall step, then installs files from this working tree into `CODEX_HOME/local-marketplaces/islee23520/plugins/lfp`. Use `node scripts/cli.mjs setup --skip-lazycodex-install` only when intentionally testing local files without reinstalling LazyCodex first.

OpenAI-compatible provider setup is consent-gated. In interactive setup, LFP asks before writing a model provider into Codex config and records the answer under `CODEX_HOME/.ledger/lfp/`. Non-interactive setup skips provider installation unless consent has already been recorded.

## Contents

- `hooks/`: LFP hook registrations.
- `scripts/sync-agent-overrides-hook.mjs`: quietly applies configured model overrides at session start and before prompt guidance.
- `scripts/visual-engineering-hook.mjs`: adds guidance to use `visual-engineering` for UI judgment and `visual-looker` for multimodal visual evidence inspection.
- `scripts/art-team-hook.mjs`: adds guidance for the LFP art team agents on art-related prompts.
- `scripts/sync-agent-overrides.mjs`: reapplies supported three-primary-field model settings for LFP-owned/runtime targets from the configured override source.
- `agent-configs/visual-engineering.toml`: LFP-owned visual engineering agent config.
- `agent-configs/visual-looker.toml`: LFP-owned Gemini multimodal looker for screenshots, rendered documents, images, diagrams, and visual evidence.
- `agent-configs/omo-agent-model-overrides.toml`: packaged default model recommendation seed used before a user `~/.codex/lfp.json` exists.
- `agent-configs/codex-openai-compat-provider.toml`: durable provider source for Codex OpenAI-compatible setup.
- `agent-overrides/omo.json`: legacy JSON override source retained for compatibility with older script callers.

## Commands

```sh
npx @islee23520/lfp@latest setup
npx @islee23520/lfp@latest setup --no-tui
npx @islee23520/lfp@latest dry-setup
npx @islee23520/lfp@latest doctor
npx @islee23520/lfp@latest agent-config

npm test
npm run setup
npm run dry-setup
npm run doctor
npm run agent-config
npm run smoke:isolated
```

`setup` installs/enables LFP under `CODEX_HOME/local-marketplaces/islee23520/plugins/lfp`, installs LFP-owned helper agents under `CODEX_HOME/agents`, and applies configured model-field overrides. LazyCodex-owned agents are not rewritten by LFP; they remain the upstream LazyCodex install output. Agent TOML sync is limited to the three primary model fields on LFP-owned/runtime targets: `model`, `model_reasoning_effort`, and `service_tier`; global default sync remains limited to the first three fields for top-level `config.toml` and `ulw.config.toml`.

The canonical user config is `${CODEX_HOME}/lfp.json` (normally `~/.codex/lfp.json`) with `schemaVersion: 2`. It stores `source`, `overrides`, and `rolePolicies` in one JSON document. Setup and `agent-config` create or update this file; `benchmark-models --apply` writes winning model fields back to this same canonical path.

Fallback model resolution is available via the MCP resolver tool for saved override configurations that include fallback fields. Installed Codex agent TOMLs receive primary model fields only.

Interactive terminals get a Clack setup shell with confirm/cancel framing around the same setup work. Non-interactive setup, `dry-setup`, and `doctor` keep line-output behavior. Use `setup --no-tui` to force the legacy line-output setup path in a TTY.

Interactive setup asks one question: "Edit agent model overrides now?". Answering yes enters a single model selection flow covering default/ULW and LFP-provided roles/agents (sisyphus, visual-*, artistry-*, fallback-capable roles). Each prompt shows the current value plus the recommendation where one exists; pressing Enter keeps and re-applies the configured value while still allowing edits. When provider models are discoverable, setup builds recommendations from the active provider inventory automatically. Saved choices are written into `${CODEX_HOME}/lfp.json` before setup applies the overrides.

When interactive model setup changes override values, LFP saves a schema-versioned JSON user copy at `${CODEX_HOME}/lfp.json`. On later interactive `setup` runs after an npx/package patch, LFP asks whether you want to adjust model overrides; answering no keeps the saved settings without rerunning the per-agent prompts. Answering yes loads the saved copy and continues into the model selection flow. Older `${CODEX_HOME}/lfp/omo-agent-model-overrides.json`, `${CODEX_HOME}/lfp/omo-agent-model-overrides.toml`, and `${CODEX_HOME}/.ledger/lfp/omo-agent-model-overrides.toml` copies are migrated automatically into the canonical JSON config path.

`agent-config` runs the same LFP model selector without reinstalling the LFP-owned helper agents. It lists already-configured override targets and writes selections to `${CODEX_HOME}/lfp.json`. Agent TOML writes are restricted to the three primary model fields on supported LFP-owned/runtime targets.

Role recommendation policy defaults live in `agent-configs/lfp-role-policies.toml`. The canonical override location is `${CODEX_HOME}/lfp.json` under `rolePolicies`; when present, those values take priority. The legacy sidecar `${CODEX_HOME}/lfp/lfp-role-policies.toml` with `[policies.<role>]` sections still works for now. Model preference order stays code-managed.

`dry-setup` previews pending writes. `doctor` reports plugin install state, upstream LazyCodex/OMO readiness, provider status, visual-agent smoke checks, and pending override work.

`smoke:isolated` runs setup, saved user override restore, override sync, doctor, and Codex Apps cache cleanup against a temporary `CODEX_HOME`; it does not touch the real Codex install.

LFP prompt hooks stay lightweight. The override sync hook is the only hook that mutates agent TOMLs, applying the configured three primary agent model fields before session start and prompt submission; the visual/art/fallback prompt hooks remain guidance-only.

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
