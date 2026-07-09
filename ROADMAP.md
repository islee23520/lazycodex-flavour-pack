# LFP Roadmap

LFP (LazyCodex Flavour Pack) is the **model/provider operations layer** for LazyCodex on Codex. LazyCodex/OMO owns agent behavior and agent TOMLs. LFP owns install/plugin promotion, consent-gated provider setup, saved overrides (`lfp.json`), three-primary-field sync, category/fallback **guidance**, benchmarks, and doctor/sync/undo tooling.

Track work in GitHub issues: <https://github.com/islee23520/lazycodex-flavour-pack/issues>.

## Direction (locked)

- LFP is **not** a full OMO agent roster bridge. It does **not** ship or reinstall LFP-owned agent TOMLs (`oracle`, `prometheus`, `hephaestus`, `atlas`, `sisyphus-junior`, …). Those are pruned on setup/sync when left by older LFP versions.
- `agent-configs/` is the source of truth for **packaged defaults**: override seed, categories, role policies, fallback chains, runtime fallback, provider template — not agent personas.
- Agent TOML writes are limited to exactly three primary fields: `model`, `model_reasoning_effort`, `service_tier`. Same three for optional global `config.toml` / `ulw.config.toml` defaults.
- Codex only supports `SessionStart` and `UserPromptSubmit` hooks. Category routing and runtime fallback are **guidance + resolver**, not automatic API intercept/retry.
- Install safety is mandatory: snapshot → write → promote with rollback.
- LFP repo stays MCP-free (no `.mcp.json` / plugin tools). Optional external xAI MCP install is consent-gated and separate.

## Capability map

| Capability | Status | Notes |
| --- | --- | --- |
| LazyCodex install + LFP plugin promote | Done | `setup` / `sync` |
| 3-field override sync + `lfp.json` | Done | Hooks + CLI |
| Provider consent + OpenAI-compat template | Done | Ledger under `.ledger/lfp/` |
| Category guidance (8 categories) | Done | Guidance only |
| Declarative fallback chains | Done | Guidance/resolver; not agent TOML fields |
| Runtime fallback config | Done | Guidance only (no API intercept) |
| Benchmark / recommend | Done | `benchmark-models` |
| skill-manager | Done | Hygiene CLI |
| xAI dedicated auth | Done | Never mutates Codex host `auth.json` |
| LFP-owned agent TOMLs | **Reversed** | Not shipped; prune only |
| Full OMO skill/team port | Out of scope | Belongs upstream / separate projects |
| CLI/TUI UX simplification | **In progress** | See UX map below |

## Phased history

### Phase 0: Vision docs — superseded

Earlier “full OMO bridge” docs are replaced by this ops-layer direction (this file + README + AGENTS + plugin manifest).

### Phase 1: LFP-owned agents — cancelled / reversed

Adding oracle/prometheus/hephaestus/atlas/sisyphus-junior as LFP-owned TOMLs created orphan agents not dispatched by upstream. Code now sets `ADDITIONAL_AGENT_CONFIGS = []` and prunes removed names.

### Phase 2–4: Category + fallback + runtime guidance — landed (stabilize)

Configs and resolvers exist. Remaining work is quiet hooks, doctor clarity, and UX — not greenfield feature ports.

### Phase 5: Full feature parity — deferred / out of scope

Background agents, Team Mode, bulk skill ports stay with LazyCodex/OMO or separate tools unless Codex gains new hook surfaces.

## Near-term work (priority order)

1. **Identity lock** — keep README / ROADMAP / plugin / AGENTS aligned with ops-layer (this change set).
2. **CLI/TUI UX** — reduce setup marathon and command confusion (see map).
3. **Doctor UX** — single scannable answer: installed? enabled? overrides drift? pruned agents gone? categories/fallback OK?
4. **Guidance quietness** — positive + quiet tests for any new trigger terms.
5. **Dead-path cleanup** — modules not on setup mainline (`setup-model-prompt` style leftovers) only after UX map P0s.

## CLI / TUI UX map (evidence-bound)

Full analysis: `.omo/evidence/lfp-cli-tui-ux.md`.

### Command surface graph

```text
lfp
├── setup ─────────┬── [TUI] intro confirm → runSetupLineMode(with selectors)
│                  └── [line] LazyCodex → Sisyphus route → provider consent
│                              → install plugin → model marathon
│                              → GitHub start? → xAI MCP consent? → sync 3 fields
├── dry-setup ──── same pipeline, check-only (no TUI)
├── agent-config ─ model marathon only (no reinstall)
├── sync ───────── LazyCodex → reinstall LFP → Sisyphus → apply lfp.json (no prompts)
├── doctor ─────── multi-line status dump (exit 1 on any issue)
├── delete ─────── remove LFP plugin tables (keeps lfp.json)
├── undo ───────── restore LazyCodex + strip LFP surfaces + drop lfp.json
├── benchmark-models
├── skill-manager
├── xai auth …
└── help
```

### Setup interaction cost (worst case)

| Stage | UI | Cost driver |
| --- | --- | --- |
| TUI intro | 1 confirm | Extra gate before any work |
| LazyCodex install | spawn | Slow; opaque progress |
| Provider consent | y/N (+ ledger) | Good |
| Model overrides | **12 targets × up to 3 fields** (+ guides/logs) | **Primary pain** |
| Saved lfp.json | keep vs adjust | Good when present; still re-enter marathon on “adjust” |
| GitHub start | optional selector | Surprise late in flow |
| xAI MCP | optional consent | Naming confuses MCP-free story |
| Final sync | silent-ish logs | OK |

Rough interactive field count: **default + ulw + ~10 agents × {model, effort, tier} ≈ 30+ prompts** if user never “keeps” wholesale.

### Ranked pain points → next UX fixes

| Pri | Pain | Why | Candidate fix |
| --- | --- | --- | --- |
| P0 | Setup model marathon | 30+ micro-prompts; no “accept all recommendations” | One “Apply recommended for all” + optional deep-edit per role |
| P0 | setup vs sync vs agent-config vs doctor | Overlapping mental model | HELP one-liner matrix + doctor “next command” hint |
| P1 | TUI is thin wrapper | Only shells line mode; console capture hides live progress | Stream progress notes; drop redundant intro or make it skippable once |
| P1 | doctor noise / exit 1 | Many lines, no summary first | PASS/WARN/FAIL header + details section |
| P1 | delete vs undo | Easy to pick wrong destructive command | Shared “what will be removed” table; stronger undo wording |
| P2 | `--agent-models-only` / `--sync-global-defaults` | Dual flags, default is global sync | Default agent-only? or single `--scope=agents\|global` |
| P2 | xAI MCP consent inside setup | Breaks MCP-free mental model mid-setup | Move to `lfp xai …` only; setup link text |
| P2 | Line vs TUI back semantics | Two interaction languages | Shared BACK token docs in every prompt |

## Backlog

- <https://github.com/islee23520/lazycodex-flavour-pack/issues/6>: Interactive external model configuration.
- <https://github.com/islee23520/lazycodex-flavour-pack/issues/7>: Install-time Codex OpenAI-compatible provider registration.
- <https://github.com/islee23520/lazycodex-flavour-pack/issues/8>: TTY provider selector.
- <https://github.com/islee23520/lazycodex-flavour-pack/issues/9>: Noninteractive provider configuration input.
- <https://github.com/islee23520/lazycodex-flavour-pack/issues/10>: Provider auth and secret-source validation.
- Category-aware benchmark scenarios.
- UX: bulk-accept recommendations; doctor summary strip; setup progress streaming.
