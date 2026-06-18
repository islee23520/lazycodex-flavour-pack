const ROLE_GUIDES = {
  default: {
    role: "Default Codex sessions.",
    tuneFor: "balanced everyday coding, edits, and terminal work.",
    minimum: "Use a dependable general coding model with medium reasoning and default tier."
  },
  ulw: {
    role: "Ultrawork planning and long-form execution.",
    tuneFor: "deep decomposition, constraint tracking, and final verification.",
    minimum: "Use a frontier reasoning model with high or xhigh reasoning; default tier is acceptable."
  },
  explorer: {
    role: "Fast codebase search and file discovery.",
    tuneFor: "low-latency repository navigation and concise evidence.",
    minimum: "Use a cheap fast model with low reasoning and fast tier when available."
  },
  librarian: {
    role: "External docs and source research.",
    tuneFor: "fast search synthesis with source-grounded citations.",
    minimum: "Use a fast economical model; upgrade only if research quality drops."
  },
  metis: {
    role: "Pre-plan ambiguity and contradiction analysis.",
    tuneFor: "critical thinking before implementation starts.",
    minimum: "Use a strong reasoning model with high reasoning."
  },
  momus: {
    role: "Plan review and executable-plan critique.",
    tuneFor: "finding missing steps, weak evidence, and impossible tasks.",
    minimum: "Use a frontier reasoning model with xhigh reasoning."
  },
  plan: {
    role: "Strategic planning for broad or vague work.",
    tuneFor: "architecture, sequencing, risk discovery, and scope control.",
    minimum: "Use a frontier reasoning model with xhigh reasoning."
  },
  "lazycodex-executor": {
    role: "LazyCodex implementation executor.",
    tuneFor: "shipping the smallest correct change with evidence.",
    minimum: "Use a frontier reasoning model with high reasoning."
  },
  "lazycodex-code-reviewer": {
    role: "LazyCodex code-quality reviewer.",
    tuneFor: "finding implementation defects, missing tests, and maintainability risks.",
    minimum: "Use a frontier reasoning model with xhigh reasoning."
  },
  "lazycodex-qa-executor": {
    role: "LazyCodex manual QA executor.",
    tuneFor: "driving real surfaces and capturing artifact-backed evidence.",
    minimum: "Use a frontier reasoning model with medium reasoning."
  },
  "lazycodex-gate-reviewer": {
    role: "LazyCodex final gate reviewer.",
    tuneFor: "validating goal compliance, QA evidence, and unresolved risk.",
    minimum: "Use a frontier reasoning model with xhigh reasoning."
  },
  "lazycodex-clone-fidelity-reviewer": {
    role: "LazyCodex clone and design-system fidelity reviewer.",
    tuneFor: "verifying design-token fidelity and catching hardcoded fake clones.",
    minimum: "Use a frontier reasoning model with xhigh reasoning."
  },
  sisyphus: {
    role: "Loop lead for implementation orchestration.",
    tuneFor: "persistent task decomposition and done-claim verification.",
    minimum: "Use a high-context reasoning model with high or xhigh reasoning."
  },
  "visual-engineering": {
    role: "Visual UI/UX judgment and screenshot-backed QA.",
    tuneFor: "layout, typography, overlap, rendering, and visual defects.",
    minimum: "Use a vision-capable model with high reasoning."
  },
  "visual-looker": {
    role: "Multimodal visual evidence extraction.",
    tuneFor: "reading screenshots, diagrams, rendered docs, and image details.",
    minimum: "Use a vision-capable model with high reasoning."
  },
  artistry: {
    role: "Art direction and production-loop supervision.",
    tuneFor: "creative direction, briefs, checkpoints, and final judgment.",
    minimum: "Use a vision-capable creative model with high reasoning."
  },
  "artistry-gen": {
    role: "Computer Use production worker for art tasks.",
    tuneFor: "cheap repeated tool operation and fast iteration.",
    minimum: "Use a low-reasoning model that can follow UI operation steps reliably."
  },
  "artistry-qa": {
    role: "Visual QA inspector for generated art.",
    tuneFor: "detecting mismatches, artifacts, and checkpoint failures.",
    minimum: "Use a vision-capable model with high reasoning."
  }
};

const FALLBACK_GUIDE = {
  role: "Agent-specific override.",
  tuneFor: "the work this agent performs most often.",
  minimum: "Start from the vanilla LazyCodex default; raise reasoning only when quality demands it."
};

export function getModelSetupGuide(agentName) {
  return ROLE_GUIDES[agentName] ?? FALLBACK_GUIDE;
}

export function formatPrimaryFields(fields) {
  if (fields === null || fields === undefined) return "not available";
  const model = fields.model ?? "unset";
  const reasoning = fields.model_reasoning_effort ?? "unset";
  const tier = fields.service_tier ?? "unset";
  return `${model} (reasoning: ${reasoning}, tier: ${tier})`;
}
