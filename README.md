# LFP

LazyCodex Flavour Pack. A small overlay for LazyCodex/Codex.

LFP assumes LazyCodex/OMO is already installed. It registers this plugin in Codex, installs LFP-owned helper agents, configures the optional `cliproxyapi` provider when safe, and syncs only model-related fields on existing upstream agent TOMLs.

Repository and LFP-owned issues live at <https://github.com/islee23520/lazycodex-flavour-pack>. If a failure is caused by upstream LazyCodex/OMO behavior rather than this flavour pack, register that issue on the upstream LazyCodex tracker instead.

Run `npx lazycodex-ai@latest install` first when the upstream plugin is missing or stale. LFP setup validates the configured `agentsDir` before writing its own install files.

## Contents

- `hooks/`: LFP hook registrations.
- `scripts/visual-engineering-hook.mjs`: adds guidance to use `visual-engineering` for UI judgment and `visual-looker` for multimodal visual evidence inspection.
- `scripts/art-team-hook.mjs`: adds guidance for the LFP art team agents on art-related prompts.
- `scripts/sync-agent-overrides.mjs`: reapplies model-related fields directly to the configured OMO agent TOMLs.
- `agent-configs/visual-engineering.toml`: LFP-owned visual engineering agent config.
- `agent-configs/visual-looker.toml`: LFP-owned Gemini multimodal looker for screenshots, rendered documents, images, diagrams, and visual evidence.
- `agent-configs/omo-agent-model-overrides.toml`: durable model override source for vanilla OMO agents.
- `agent-configs/codex-openai-compat-provider.toml`: durable provider source for Codex OpenAI-compatible setup.
- `agent-overrides/omo.json`: legacy JSON override source retained for compatibility with older script callers.

## Commands

```sh
npx @islee23520/lfp@latest setup
npx @islee23520/lfp@latest dry-setup
npx @islee23520/lfp@latest doctor
npx @islee23520/lfp@latest agent-config

npm test
npm run setup
npm run dry-setup
npm run doctor
npm run agent-config
```

`setup` installs/enables LFP under `CODEX_HOME/local-marketplaces/islee23520/plugins/lfp`, installs helper agents under `CODEX_HOME/agents`, and applies configured model-field overrides.

When interactive OMO model setup changes override values, LFP also saves a user copy at `${CODEX_HOME}/lfp/omo-agent-model-overrides.toml`. On later `setup` runs after an npx/package patch, LFP asks whether to apply that saved user copy before showing the model selection prompts.

`agent-config` runs the same OMO override selector without reinstalling the LFP-owned helper agents. It lists already-configured override targets and can opt additional installed upstream agent TOMLs into the override file. Only `model`, `model_reasoning_effort`, and `service_tier` are written.

`dry-setup` previews pending writes. `doctor` reports plugin install state, upstream LazyCodex/OMO readiness, provider status, visual-agent smoke checks, and pending override work.

LFP UserPromptSubmit hooks are guidance-only. They do not install plugins, sync overrides, or touch LazyCodex/OMO main hooks during prompt submission.

The packaged override configs resolve `${CODEX_HOME}` at runtime, so the same release works across different user home directories and custom Codex homes without editing the shipped files.

## Publish

GitHub Actions publish automation lives at `.github/workflows/publish.yml`. It runs when a GitHub `release published` event fires and can also be started manually with `workflow_dispatch`.

The workflow verifies the package with `npm test` and `npm pack --dry-run`, then publishes with `npm publish --provenance --access public`.

### Required npm publishing setup

Configure GitHub Actions secret `NPM_TOKEN` with an npm token that can publish `@islee23520/lfp`.

If using npm Trusted Publishing instead of a token, configure npm for:

- Package: `@islee23520/lfp`
- Repository: `islee23520/lazycodex-flavour-pack`
- Workflow file: `publish.yml`

```sh
npm trust github @islee23520/lfp --repo islee23520/lazycodex-flavour-pack --file publish.yml
```

After auth is configured, publish by creating a GitHub release or manually running the workflow.
