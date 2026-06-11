import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

export function prepareRuntimePromotion(packageRoot, pluginRoot, entries) {
  const suffix = `${process.pid}-${Date.now()}`;
  const tempRoot = `${pluginRoot}.tmp-${suffix}`;
  const backupRoot = `${pluginRoot}.bak-${suffix}`;
  rmSync(tempRoot, { recursive: true, force: true });
  rmSync(backupRoot, { recursive: true, force: true });
  mkdirSync(tempRoot, { recursive: true });

  try {
    for (const entry of entries) {
      cpSync(path.join(packageRoot, entry), path.join(tempRoot, entry), { recursive: true });
    }
    return { tempRoot, pluginRoot, backupRoot };
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export function commitRuntimePromotion(promotion) {
  if (existsSync(promotion.pluginRoot)) renameSync(promotion.pluginRoot, promotion.backupRoot);
  try {
    renameSync(promotion.tempRoot, promotion.pluginRoot);
    rmSync(promotion.backupRoot, { recursive: true, force: true });
  } catch (error) {
    if (existsSync(promotion.backupRoot) && !existsSync(promotion.pluginRoot)) {
      renameSync(promotion.backupRoot, promotion.pluginRoot);
    }
    throw error;
  }
}

export function rollbackRuntimePromotion(promotion) {
  rmSync(promotion.tempRoot, { recursive: true, force: true });
  if (existsSync(promotion.backupRoot) && !existsSync(promotion.pluginRoot)) {
    renameSync(promotion.backupRoot, promotion.pluginRoot);
  }
}
