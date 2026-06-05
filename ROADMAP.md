# LFP Roadmap

LFP means LazyCodex Flavour Pack.

Track roadmap work in GitHub issues: <https://github.com/islee23520/lfp/issues>. File upstream LazyCodex/OMO bugs upstream.

## Direction

- Lightweight overlay for already-installed LazyCodex/OMO agents.
- `agent-configs/` is the source of truth for helper agents and model overrides.
- Setup stays small: register LFP, install helper agents, configure the provider when safe, verify upstream LazyCodex/OMO, then apply model-field overrides.
- No agent lifecycle manager, upstream plugin replacement, or broad TOML rewriting.

## Near-Term Work

- Preserve `setup`, `dry-setup`, and `doctor`.
- Make `doctor` answer "is LFP installed in Codex?" without noisy output.
- Keep `cliproxyapi` setup conservative: add missing config, preserve user-managed active providers, report drift.
- Add visual hook triggers only with positive and quiet-case tests.
- Keep legacy JSON override compatibility until old callers are gone.

## Backlog

- <https://github.com/islee23520/lfp/issues/6>: Interactive external model configuration.
- <https://github.com/islee23520/lfp/issues/7>: Install-time Codex OpenAI-compatible provider registration.
- <https://github.com/islee23520/lfp/issues/8>: TTY provider selector.
- <https://github.com/islee23520/lfp/issues/9>: Noninteractive provider configuration input.
- <https://github.com/islee23520/lfp/issues/10>: Provider auth and secret-source validation.
