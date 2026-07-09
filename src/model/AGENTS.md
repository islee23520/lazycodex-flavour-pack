# src/model — model overrides, sync, guidance

**Parent:** root `AGENTS.md`. Do not restate package-wide rules.

## OVERVIEW

Central hub for saved overrides, three-field agent TOML sync, interactive agent-config, benchmarks, and read-only fallback/category guidance. ~half of `src/` LOC; only depends on `utils/`.

## WHERE TO LOOK

| Task | File | Notes |
| --- | --- | --- |
| Sync 3 fields → agent TOMLs | `sync-agent-overrides.ts` | `syncAgentOverrides`, `applyModelOverrides` |
| Global default/ulw sync | `global-model-defaults.ts` | `config.toml` + `ulw.config.toml` |
| SessionStart/hook sync | `sync-agent-overrides-hook.ts` | Quiet on failure; `LFP_AGENT_MODELS_ONLY=1` skips globals |
| Load/merge override config | `model-override-config.ts` | Packaged TOML + path expand |
| User `lfp.json` + legacy migrate | `user-model-overrides.ts` | Schema v1/v2; restore → temp TOML for sync |
| Schema / validate | `model-override-schema.ts` | Primary + fallback fields in saved config |
| Interactive agent-config | `agent-model-config.ts`, `agent-model-config-flow.ts`, `model-config-prompts.ts` | Step machine + `BACK_SELECTION` |
| Recommendations | `model-recommendations.ts`, `role-policy-config.ts` | Policies from `agent-configs/lfp-role-policies.toml` + `lfp.json` |
| Provider inventory | `model-provider.ts`, `model-inventory.ts` | Live model list for setup/sync |
| Fallback guidance (read-only) | `model-fallback-guidance.ts`, `model-fallback-resolver.ts`, `runtime-fallback-engine.ts` | Chains/runtime TOML; not written to agent TOML |
| Category routing keywords | `category-resolver.ts` | `agent-configs/lfp-categories.toml` |
| Benchmark CLI | `model-benchmark.ts` + `model-benchmark-*.ts` | `lfp benchmark-models` |
| Prune removed agents | `removed-lfp-agents.ts` | Do not re-add packaging for these names |

## CONVENTIONS

- **Writable agent fields:** `model`, `model_reasoning_effort`, `service_tier` only.
- Fallback fields may live in saved config / packaged TOML for guidance; never emit them into upstream agent TOMLs.
- Virtual sections `default` / `ulw` → global configs, not `agents/<name>.toml`.
- Caches: category + role-policy loaders may mtime-fingerprint files; clear in tests when mutating.

## ANTI-PATTERNS

- Do not import `install/` or `cli/` from here (keep hub leaf toward utils only).
- Do not expand `applyModelOverrides` field set without updating tests + root anti-patterns.
- Do not drop legacy JSON override migration paths casually.
- Do not make hook guidance mutate files (sync path is the only mutator).

## NOTES

- Heavy tests: `test/sync-agent-overrides.test.ts`, `agent-model-config.test.ts`, `user-model-overrides.test.ts`.
- Packaged defaults: `agent-configs/omo-agent-model-overrides.toml` (and sibling TOMLs).
