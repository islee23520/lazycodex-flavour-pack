# LFP Roadmap

LFP (LazyCodex Flavour Pack) extends LazyCodex — the OMO Light edition for Codex — to bring the full OMO feature set into the Codex environment. LazyCodex intentionally ships only a portable subset (rules, ultrawork, lsp, 6 core agents) because it targets GPT-only workflows. LFP bridges the rest: the complete agent roster, category-based model routing, MCP fallback resolver for saved override configurations, art team orchestration, visual specialists, and multi-model provider support.

Track roadmap work in GitHub issues: <https://github.com/islee23520/lazycodex-flavour-pack/issues>.

## Direction

- LFP is the **full OMO feature bridge for Codex**, not a lightweight overlay.
- `agent-configs/` is the source of truth for LFP-owned agents, model overrides, categories, and fallback configuration.
- Setup stays safe: install/update upstream LazyCodex first, register LFP, install LFP agents, configure the provider when consented, verify upstream, then apply model-field overrides.
- Agent TOML override sync on upstream OMO agents is limited to exactly three primary model fields. LFP-owned agents have full TOML control.
- Codex only supports `SessionStart` and `UserPromptSubmit` hooks. Category routing, runtime fallback, and orchestration work within this constraint — via guidance hooks, MCP tools, resolver logic, and multi-agent patterns.
- Install safety is mandatory for every agent or config write: snapshot → write → promote with rollback.

## OMO Feature Gap

| OMO Feature | LazyCodex (Light) | LFP Current | LFP Target |
| --- | --- | --- | --- |
| 11 agents | 6 core | +6 LFP-owned = 12 total | +5 missing = 17 total |
| 8 categories with model routing | None | None | Full category system |
| Per-agent + per-category fallback chains | None | MCP resolver tool for saved override configurations | Manual chains + resolver |
| Runtime fallback (retry on 408/429/5xx) | None | Guidance hook | Retry engine |
| 14+ skills | Subset | None | Port remaining skills |
| Background agents / parallel orchestration | None | None | Emulated via multi-agent patterns |
| Team Mode (61 hooks) | None | Art team trio | Team Mode emulation |
| Multi-model support (GPT, Gemini, Grok, Claude) | GPT-focused | Provider config + benchmark + multi-model override | Full multi-model |

## Phased Plan

### Phase 0: Vision Alignment ✅

**Goal:** Update project documentation to reflect the full OMO bridge direction.

- [x] Rewrite AGENTS.md from "lightweight overlay" to "full OMO feature bridge"
- [x] Rewrite ROADMAP.md with phased migration plan
- [x] Update plugin.json description and capabilities
- [x] Update README.md intro and contents
- [x] Update package.json description

### Phase 1: Missing Agents

**Goal:** Add the 5 OMO agents not yet present in Codex: oracle, prometheus, hephaestus, atlas, sisyphus-junior.

**Files to create:**
- `agent-configs/oracle.toml` — read-only high-IQ reasoning consultant for architecture and debugging
- `agent-configs/prometheus.toml` — strategic planner, writes `.omo/plans/*.md`
- `agent-configs/hephaestus.toml` — implementation worker
- `agent-configs/atlas.toml` — execution coordinator
- `agent-configs/sisyphus-junior.toml` — focused task executor (no delegation)

**Files to modify:**
- `.codex-plugin/plugin.json` — add 5 agents to `additionalAgents`
- `scripts/codex-plugin-install.mjs` — verify new agents install correctly
- `scripts/cli-reporting.mjs` — doctor reports new agents

**Test:** New test file verifying all 5 agent TOMLs parse, install, and pass smoke check.

### Phase 2: Category System

**Goal:** Implement OMO's 8-category routing in Codex. Categories route work to domain-optimized models.

**Categories:** visual-engineering, ultrabrain, deep, artistry, quick, unspecified-low, unspecified-high, writing.

**Files to create:**
- `agent-configs/lfp-categories.toml` — declarative category definitions (model, reasoning_effort, service_tier, fallback_models per category)
- `scripts/category-resolver.mjs` — resolves a category name → model + agent + fallback chain
- `scripts/category-guidance-hook.mjs` — UserPromptSubmit hook that emits category routing guidance when a category keyword is detected
- `test/category-resolver.test.mjs` — tests for category resolution

**Files to modify:**
- `scripts/user-prompt-submit.mjs` — route to category guidance hook
- `.codex-plugin/plugin.json` — add category resolver MCP tool if needed

**Constraint:** Category routing is guidance + resolver based. Codex has no native category dispatch; LFP guides the agent to use the right model/agent for the category.

### Phase 3: Declarative Fallback Chains

**Goal:** Implement OMO's per-agent and per-category `fallback_models[]` as declarative config consumed by the existing resolver.

**Files to create:**
- `agent-configs/lfp-fallback-chains.toml` — per-agent + per-category ordered fallback model arrays
- `test/fallback-chains.test.mjs` — tests for chain resolution

**Files to modify:**
- `scripts/model-fallback-resolver.mjs` — read declarative chains, return ordered fallback list
- `scripts/model-override-schema.mjs` — add fallback chain schema
- `scripts/model-fallback-guidance.mjs` — emit full chain on quota/429 trigger, not just first fallback

### Phase 4: Runtime Fallback Engine

**Goal:** Implement OMO's runtime retry logic for transient errors (408/429/5xx).

**Files to create:**
- `scripts/runtime-fallback-engine.mjs` — retry policy engine (max attempts, cooldown, timeout, notify)
- `agent-configs/lfp-runtime-fallback.toml` — runtime fallback config (retry_on_errors, max_fallback_attempts, cooldown_seconds, timeout_seconds, notify_on_fallback)
- `test/runtime-fallback.test.mjs` — tests for retry logic

**Files to modify:**
- `scripts/model-fallback-guidance.mjs` — use runtime engine for retry guidance
- `.codex-plugin/plugin.json` — expose runtime fallback MCP tool

**Constraint:** Codex hooks cannot intercept model API calls directly. Runtime fallback works via guidance (tell agent to retry with fallback model) + MCP resolver, not automatic retry. True automatic retry depends on future Codex failure-hook support.

### Phase 5: Full Feature Parity

**Goal:** Port remaining OMO capabilities that Codex can support.

**Sub-phases:**
- **5a: Background agent emulation** — multi-agent dispatch patterns via spawn_agent + MCP tools
- **5b: Team Mode emulation** — extend art team pattern (role separation, checkpoints, evidence-bound QA) to general orchestration
- **5c: Remaining skills** — port OMO skills not shipped by LazyCodex (security-research, opencode-qa, hyperplan, github-triage, etc.)
- **5d: Model fallback title** — experimental model_fallback_title feature from OMO config

## Near-Term Work

- Preserve `setup`, `dry-setup`, `doctor`, `agent-config`, `smoke:isolated` commands.
- Make `doctor` answer "is LFP installed in Codex and are all OMO features bridged?" without noisy output.
- Keep OpenAI-compatible provider setup conservative: add missing config, preserve user-managed active providers, report drift.
- Add visual/art/category/fallback hook triggers only with positive and quiet-case tests.
- Keep legacy JSON override compatibility until old callers are gone.
- Validate new agents (oracle, prometheus, hephaestus, atlas, sisyphus-junior) at install time and doctor time.

## Backlog

- <https://github.com/islee23520/lazycodex-flavour-pack/issues/6>: Interactive external model configuration.
- <https://github.com/islee23520/lazycodex-flavour-pack/issues/7>: Install-time Codex OpenAI-compatible provider registration.
- <https://github.com/islee23520/lazycodex-flavour-pack/issues/8>: TTY provider selector.
- <https://github.com/islee23520/lazycodex-flavour-pack/issues/9>: Noninteractive provider configuration input.
- <https://github.com/islee23520/lazycodex-flavour-pack/issues/10>: Provider auth and secret-source validation.
- Category-aware benchmark scenarios (benchmark per category model, not just per agent).
- Team Mode orchestration patterns beyond art team (sisyphus loop, plan-review loop).
