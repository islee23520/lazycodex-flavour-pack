import path from "node:path";
import { fileURLToPath } from "node:url";
export function getPackageRoot(importMetaUrl) {
    const moduleDir = path.dirname(fileURLToPath(importMetaUrl));
    const parent = path.basename(path.dirname(moduleDir));
    const grandparent = path.basename(path.dirname(path.dirname(moduleDir)));
    if (parent === "src" && grandparent === "dist") {
        return path.resolve(moduleDir, "..", "..", "..");
    }
    return path.resolve(moduleDir, "..", "..");
}
