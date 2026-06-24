import { createInterface } from "node:readline";

export const GITHUB_START_TARGETS = [
  {
    id: "lazycodex-ai",
    label: "LazyCodex AI",
    repo: "sisyphuslabs/lazycodex-ai",
    url: "https://github.com/sisyphuslabs/lazycodex-ai"
  },
  {
    id: "omo",
    label: "OMO",
    repo: "sisyphuslabs/omo",
    url: "https://github.com/sisyphuslabs/omo"
  },
  {
    id: "lfp",
    label: "LFP",
    repo: "islee23520/lazycodex-flavour-pack",
    url: "https://github.com/islee23520/lazycodex-flavour-pack"
  }
];

export async function maybePromptGitHubStart(options = {}) {
  const output = options.output ?? console;
  if (typeof options.gitHubStartSelector === "function") {
    const target = await options.gitHubStartSelector();
    if (target === null) return null;

    output.log(`GitHub start: ${target.url}`);
    return target;
  }

  const rl = options.readline ?? createInterface({ input: process.stdin, output: process.stdout });

  try {
    output.log("GitHub start targets:");
    for (const [index, target] of GITHUB_START_TARGETS.entries()) {
      output.log(`  ${index + 1}. ${target.label} (${target.repo})`);
    }

    const answer = await prompt(rl, "Start GitHub work from which repo? [1/2/3, Enter to skip]: ");
    const target = selectGitHubStartTarget(answer);
    if (target === null) return null;

    output.log(`GitHub start: ${target.url}`);
    return target;
  } finally {
    if (!options.readline) rl.close();
  }
}

export function selectGitHubStartTarget(answer) {
  const value = String(answer ?? "")
    .trim()
    .toLowerCase();
  if (value.length === 0 || ["n", "no", "skip"].includes(value)) return null;

  if (/^[0-9]+$/.test(value)) return GITHUB_START_TARGETS[Number(value) - 1] ?? null;
  return (
    GITHUB_START_TARGETS.find((target) => {
      return value === target.id || value === target.repo.toLowerCase() || value === target.label.toLowerCase();
    }) ?? null
  );
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}
