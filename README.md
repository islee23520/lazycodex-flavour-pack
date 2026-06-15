# LFP

LazyCodex extension plugin that brings the full OMO feature set into Codex.

LazyCodex is the OMO Light edition for Codex — it intentionally ships only a portable subset (rules, ultrawork, lsp, 6 core agents) because it targets GPT-only workflows. LFP bridges the rest: the complete agent roster, category-based model routing, declarative fallback chains, runtime fallback, art team orchestration, visual specialists, provider configuration, and model benchmarking.

LFP runs `npx lazycodex-ai install` first, then registers this plugin in Codex, installs LFP-owned agents, optionally configures a generic OpenAI-compatible provider only after operator consent, and syncs model fields on existing upstream agent TOMLs.

Repository and LFP-owned issues live at <https://github.com/islee23520/lazycodex-flavour-pack>. If a failure is caused by upstream LazyCodex/OMO behavior rather than this flavour pack, register that issue on the upstream LazyCodex tracker instead.

`lfp setup` runs `npx lazycodex-ai install` before applying LFP. It validates the configured `agentsDir` before writing its own install files.

Local development uses the checkout directly: `npm run setup` runs the LazyCodex preinstall step, then installs files from this working tree into `CODEX_HOME/local-marketplaces/islee23520/plugins/lfp`. Use `node scripts/cli.mjs setup --skip-lazycodex-install` only when intentionally testing local files without reinstalling LazyCodex first.

OpenAI-compatible provider setup is consent-gated. In interactive setup, LFP asks before writing a model provider into Codex config and records the answer under `CODEX_HOME/.ledger/lfp/`. Non-interactive setup skips provider installation unless consent has already been recorded.

## Contents

- `hooks/`: LFP hook registrations.
- `scripts/sync-agent-overrides-hook.mjs`: quietly applies configured model overrides at session start and before prompt guidance.
- `scripts/visual-engineering-hook.mjs`: adds guidance to use `visual-engineering` for UI judgment and `visual-looker` for multimodal visual evidence inspection.
- `scripts/art-team-hook.mjs`: adds guidance for the LFP art team agents on art-related prompts.
- `scripts/sync-agent-overrides.mjs`: reapplies the six public agent model fields directly to the configured OMO agent TOMLs.
- `agent-configs/visual-engineering.toml`: LFP-owned visual engineering agent config.
- `agent-configs/visual-looker.toml`: LFP-owned Gemini multimodal looker for screenshots, rendered documents, images, diagrams, and visual evidence.
- `agent-configs/omo-agent-model-overrides.toml`: durable model override source for vanilla OMO agents.
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

`setup` installs/enables LFP under `CODEX_HOME/local-marketplaces/islee23520/plugins/lfp`, installs helper agents under `CODEX_HOME/agents`, and applies configured model-field overrides. Agent TOML sync is limited to `model`, `model_reasoning_effort`, `service_tier`, `model_fallback`, `model_fallback_reasoning_effort`, and `model_fallback_service_tier`; global default sync remains limited to the first three fields for top-level config and `[profiles.ulw]`.

Interactive terminals get a Clack setup shell with confirm/cancel framing around the same setup work. Non-interactive setup, `dry-setup`, and `doctor` keep line-output behavior. Use `setup --no-tui` to force the legacy line-output setup path in a TTY.

Interactive setup can discover the active Codex provider's `/models` endpoint and use that list for default Codex, ULW, and OMO agent model choices. Each prompt shows the current value plus the recommendation where one exists; pressing Enter keeps and re-applies the configured value while still allowing edits. Saved choices are written into `${CODEX_HOME}/lfp/` before setup applies the overrides.

When interactive OMO model setup changes override values, LFP also saves a schema-versioned JSON user copy at `${CODEX_HOME}/lfp/omo-agent-model-overrides.json`. On later interactive `setup` runs after an npx/package patch, LFP asks whether you want to adjust model overrides; answering no keeps the saved settings without rerunning the per-agent prompts. Answering yes loads the saved copy and continues into the model selection flow. Older `${CODEX_HOME}/lfp/omo-agent-model-overrides.toml` and `${CODEX_HOME}/.ledger/lfp/omo-agent-model-overrides.toml` copies are migrated into the JSON config path.

`agent-config` runs the same OMO override selector without reinstalling the LFP-owned helper agents. It lists already-configured override targets and can opt additional installed upstream agent TOMLs into the override file. Agent TOML writes are restricted to the six public model and fallback model fields.

`dry-setup` previews pending writes. `doctor` reports plugin install state, upstream LazyCodex/OMO readiness, provider status, visual-agent smoke checks, and pending override work.

`smoke:isolated` runs setup, saved user override restore, override sync, doctor, and Codex Apps cache cleanup against a temporary `CODEX_HOME`; it does not touch the real Codex install.

LFP prompt hooks stay lightweight. The override sync hook is the only hook that mutates agent TOMLs, applying the configured six-field agent model contract before session start and prompt submission; the visual/art/fallback prompt hooks remain guidance-only.

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
