# LFP Roadmap

LFP means LazyCodex Flavour Pack. Keep that expansion visible in planning docs, README text, and issue surfaces so the package name does not drift into an unexplained acronym.

## Direction

- Keep LFP as a lightweight overlay for already-installed LazyCodex/OMO agents.
- Keep `agent-configs/` as the durable source of truth for Linalab-owned helper agents and narrow upstream model overrides.
- Keep setup simple: install/register LFP in Codex, install LFP-owned helper agents, verify upstream LazyCodex/OMO exists, then apply model-field overrides.
- Keep issue discussions grounded in the LazyCodex Flavour Pack scope rather than turning LFP into an agent lifecycle manager or upstream plugin replacement.

## Near-Term Work

- Preserve the `setup`, `dry-setup`, and `doctor` command surface.
- Expand doctor output only when it improves the operator answer to "is LFP installed in Codex?"
- Add visual hook trigger terms only with positive and quiet-case tests.
- Keep legacy JSON override compatibility until old callers are known to be gone.
