# LFP: LazyCodex Flavour Pack

LFP means LazyCodex Flavour Pack. This package is the Linalab-local flavour pack for LazyCodex/Codex.

This plugin is intentionally layered on top of the upstream LazyCodex/OMO plugin. It must stay lightweight: installing or syncing it only overrides selected settings on already-installed agents. It does not create, regenerate, migrate, or manage the upstream agent set.

The setup command checks that the configured upstream `agentsDir` exists and that every agent named in the override config already has a TOML file there. If LazyCodex/OMO is missing or stale, the command fails and the operator must install or update the upstream plugin first.

The durable source of truth is `agent-configs/`; the sync command reapplies only model-related fields to the current OMO agent snapshot.

## Contents

- `hooks/`: Linalab-only hook registrations.
- `scripts/visual-engineering-hook.mjs`: adds guidance to use `visual-engineering` for UI judgment and `visual-looker` for multimodal visual evidence inspection.
- `scripts/sync-agent-overrides.mjs`: reapplies model-related fields directly to the configured OMO agent TOMLs.
- `agent-configs/visual-engineering.toml`: Linalab-owned visual engineering agent config.
- `agent-configs/visual-looker.toml`: Linalab-owned Gemini multimodal looker for screenshots, rendered documents, images, diagrams, and visual evidence.
- `agent-configs/omo-agent-model-overrides.toml`: durable model override source for vanilla OMO agents.
- `agent-overrides/omo.json`: legacy JSON override source retained for compatibility with older script callers.

## Commands

```sh
npx lfp@latest setup
npx lfp@latest dry-setup
npx lfp@latest doctor

npm test
npm run setup
npm run dry-setup
npm run doctor
```

`npx lfp@latest setup` is intentionally small: npm downloads this package, installs/enables LFP in Codex under `CODEX_HOME/local-marketplaces/linalab/plugins/lfp`, installs LFP-owned helper agents under `CODEX_HOME/agents`, checks the configured LazyCodex/OMO agent directory, and applies the configured overrides to existing agent TOMLs. It does not install or update LazyCodex.ai/OMO itself. Run `npx lazycodex-ai@latest install` first when the upstream plugin is missing or stale.

`dry-setup` previews the files setup would change without writing. `doctor` checks whether LFP is installed/enabled in Codex, checks the upstream LazyCodex/OMO install, and reports whether setup is pending.
