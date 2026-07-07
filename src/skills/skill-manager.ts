import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";

const SKILL_FILE_NAME = "SKILL.md";
const TIMESTAMP_PATTERN = /[:.TZ-]/g;

export class SkillManagerUsageError extends Error {
  readonly exitCode = 2;
}

export function parseSkillManagerArgs(argv) {
  const parsed = { mode: "check", json: false };
  let sawCheck = false;
  let sawApply = false;

  for (const item of argv) {
    if (item === "--check") {
      sawCheck = true;
      parsed.mode = "check";
      continue;
    }
    if (item === "--apply") {
      sawApply = true;
      parsed.mode = "apply";
      continue;
    }
    if (item === "--json") {
      parsed.json = true;
      continue;
    }
    throw new SkillManagerUsageError(`Unknown skill-manager option: ${item}`);
  }

  if (sawCheck && sawApply) throw new SkillManagerUsageError("--check cannot be combined with --apply");
  return parsed;
}

export function runSkillManagerCommand(argv, options = {}) {
  const args = parseSkillManagerArgs(argv);
  const state = collectSkillManagerState(options);
  const plan = createSkillManagerPlan(state);
  const result =
    args.mode === "apply"
      ? applySkillManagerPlan(plan, options)
      : { ...state, plannedMoves: plan.plannedMoves, appliedMoves: [], receiptPath: null };

  if (args.json) {
    options.output?.log?.(JSON.stringify(result, null, 2));
    return result;
  }

  printHumanReport(result, args.mode, options.output ?? console);
  return result;
}

export function collectSkillManagerState(options = {}) {
  const roots = resolveSkillRoots(options);
  const inventory = [];
  const issues = [];
  const skipped = [];

  for (const root of roots) {
    if (!existsSync(root.path)) continue;
    for (const entry of readdirSync(root.path, { withFileTypes: true })) {
      const entryPath = path.join(root.path, entry.name);
      const name = normalizeSkillName(entry.name);

      if (isSymlink(entryPath)) {
        skipped.push({ path: entryPath, reason: "symlink" });
        continue;
      }
      if (!entry.isDirectory()) {
        skipped.push({ path: entryPath, reason: "not-directory" });
        continue;
      }

      const skill = readSkillEntry({
        entryPath,
        location: root.location,
        name,
        rootPath: root.path,
        rootType: root.type
      });
      inventory.push(skill);
      if (skill.location === "active" && !skill.valid) {
        issues.push({ kind: "invalid-skill", name: skill.name, path: skill.path, reason: skill.invalidReason });
      }
    }
  }

  for (const duplicate of findDuplicateSkills(inventory)) issues.push(duplicate);

  return { roots, inventory, issues, skipped };
}

export function createSkillManagerPlan(state) {
  const plannedMoves = [];
  for (const issue of state.issues) {
    if (issue.kind !== "invalid-skill") continue;
    const source = state.inventory.find((entry) => entry.path === issue.path);
    if (source === undefined || source.location !== "active") continue;
    plannedMoves.push({
      reason: issue.reason,
      from: source.path,
      to: resolveDisabledTarget(source),
      rootType: source.rootType,
      name: source.name
    });
  }
  return { ...state, plannedMoves };
}

export function applySkillManagerPlan(plan, options = {}) {
  const codexHome = resolveCodexHome(options);
  const stateDir = path.join(codexHome, ".omo", "skill-manager");
  mkdirSync(stateDir, { recursive: true });
  const lockPath = path.join(stateDir, "apply.lock");
  let lockFd = null;

  try {
    lockFd = openSync(lockPath, "wx");
  } catch {
    throw new SkillManagerUsageError(`skill-manager apply is already running (${lockPath})`);
  }

  const appliedMoves = [];
  const skipped = [...plan.skipped];

  try {
    for (const move of plan.plannedMoves) {
      try {
        const targetPath = uniqueTargetPath(move.to);
        mkdirSync(path.dirname(targetPath), { recursive: true });
        renameSync(move.from, targetPath);
        appliedMoves.push({ ...move, to: targetPath });
      } catch (error) {
        skipped.push({ path: move.from, reason: `move-failed: ${formatError(error)}` });
      }
    }

    const receiptPath = path.join(stateDir, `receipt-${new Date().toISOString().replace(TIMESTAMP_PATTERN, "")}.json`);
    const result = { ...plan, appliedMoves, skipped, receiptPath };
    writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    if (lockFd !== null) closeSync(lockFd);
    rmSync(lockPath, { force: true });
  }
}

function resolveSkillRoots(options) {
  const codexHome = resolveCodexHome(options);
  const home = resolveHome(options);
  const codexLibraryRoot = path.join(codexHome, "skills.library");
  const roots = [
    { type: "codex", location: "active", path: path.join(codexHome, "skills") },
    { type: "codex", location: "disabled", path: path.join(codexHome, "skills.disabled") },
    { type: "agents", location: "active", path: path.join(home, ".agents", "skills") },
    { type: "agents", location: "disabled", path: path.join(home, ".agents", "skills.disabled") }
  ];

  if (existsSync(codexLibraryRoot)) {
    for (const entry of readdirSync(codexLibraryRoot, { withFileTypes: true })) {
      if (entry.isDirectory())
        roots.push({ type: "codex", location: "library", path: path.join(codexLibraryRoot, entry.name) });
    }
  }

  return roots;
}

function readSkillEntry({ entryPath, location, name, rootPath, rootType }) {
  const skillPath = path.join(entryPath, SKILL_FILE_NAME);
  const base = { location, name, path: entryPath, rootPath, rootType, skillPath };
  try {
    const text = readFileSync(skillPath, "utf8");
    const frontmatterName = readFrontmatterName(text);
    if (frontmatterName === null) return { ...base, valid: false, invalidReason: "missing-frontmatter-name" };
    return { ...base, valid: true, frontmatterName };
  } catch (error) {
    return {
      ...base,
      valid: false,
      invalidReason: existsSync(skillPath) ? `unreadable: ${formatError(error)}` : "missing-skill-md"
    };
  }
}

function findDuplicateSkills(inventory) {
  const byName = new Map();
  for (const entry of inventory) {
    const current = byName.get(entry.name) ?? [];
    current.push(entry.path);
    byName.set(entry.name, current);
  }

  const issues = [];
  for (const [name, paths] of byName.entries()) {
    if (paths.length > 1) issues.push({ kind: "duplicate-skill", name, paths });
  }
  return issues;
}

function resolveDisabledTarget(entry) {
  const disabledRoot =
    entry.rootType === "agents"
      ? path.join(path.dirname(entry.rootPath), "skills.disabled")
      : path.join(path.dirname(entry.rootPath), "skills.disabled");
  return path.join(disabledRoot, path.basename(entry.path));
}

function uniqueTargetPath(targetPath) {
  if (!existsSync(targetPath)) return targetPath;
  const stamp = new Date().toISOString().replace(TIMESTAMP_PATTERN, "");
  return `${targetPath}.disabled-${stamp}`;
}

function readFrontmatterName(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (match === null) return null;
  const nameMatch = /^name:\s*(.+)$/m.exec(match[1]);
  const value = nameMatch?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function isSymlink(filePath) {
  try {
    return lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

function normalizeSkillName(name) {
  return name.trim().toLowerCase();
}

function resolveCodexHome(options) {
  const env = options.env ?? process.env;
  return env.CODEX_HOME?.trim() || path.join(resolveHome(options), ".codex");
}

function resolveHome(options) {
  const env = options.env ?? process.env;
  return env.HOME?.trim() || os.homedir();
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function printHumanReport(result, mode, output) {
  output.log(`lfp skill-manager: mode=${mode}`);
  output.log(`lfp skill-manager: skills=${result.inventory.length}, issues=${result.issues.length}`);
  for (const issue of result.issues) {
    if (issue.kind === "invalid-skill")
      output.log(`lfp skill-manager: invalid ${issue.name}: ${issue.reason} (${issue.path})`);
    if (issue.kind === "duplicate-skill")
      output.log(`lfp skill-manager: duplicate ${issue.name}: ${issue.paths.join(", ")}`);
  }
  for (const move of result.plannedMoves)
    output.log(`lfp skill-manager: ${mode === "apply" ? "planned" : "would move"} ${move.from} -> ${move.to}`);
  for (const move of result.appliedMoves) output.log(`lfp skill-manager: moved ${move.from} -> ${move.to}`);
  if (result.receiptPath !== null && result.receiptPath !== undefined)
    output.log(`lfp skill-manager: receipt ${result.receiptPath}`);
}
