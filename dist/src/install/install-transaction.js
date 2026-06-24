import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
export function createInstallSnapshot(state) {
    const snapshotRoot = path.join(os.tmpdir(), `lfp-install-snapshot-${process.pid}-${Date.now()}`);
    const agentRoot = path.join(snapshotRoot, "agents");
    const configBackup = path.join(snapshotRoot, "config.toml");
    mkdirSync(agentRoot, { recursive: true });
    const agents = state.additionalAgentFiles.map((filePath) => {
        const backupPath = path.join(agentRoot, path.basename(filePath));
        const existed = existsSync(filePath);
        if (existed)
            cpSync(filePath, backupPath);
        return { filePath, backupPath, existed };
    });
    const configExisted = existsSync(state.configPath);
    if (configExisted)
        cpSync(state.configPath, configBackup);
    const marketplaceManifestBackup = path.join(snapshotRoot, "marketplace.json");
    const marketplaceManifestExisted = existsSync(state.marketplaceManifestPath);
    if (marketplaceManifestExisted)
        cpSync(state.marketplaceManifestPath, marketplaceManifestBackup);
    return {
        snapshotRoot,
        agents,
        configPath: state.configPath,
        configBackup,
        configExisted,
        marketplaceManifestPath: state.marketplaceManifestPath,
        marketplaceManifestBackup,
        marketplaceManifestExisted
    };
}
export function restoreInstallSnapshot(snapshot) {
    for (const agent of snapshot.agents) {
        if (agent.existed) {
            mkdirSync(path.dirname(agent.filePath), { recursive: true });
            rmSync(agent.filePath, { force: true });
            cpSync(agent.backupPath, agent.filePath);
        }
        else {
            rmSync(agent.filePath, { force: true });
        }
    }
    if (snapshot.configExisted) {
        mkdirSync(path.dirname(snapshot.configPath), { recursive: true });
        rmSync(snapshot.configPath, { force: true });
        cpSync(snapshot.configBackup, snapshot.configPath);
    }
    else {
        rmSync(snapshot.configPath, { force: true });
    }
    if (snapshot.marketplaceManifestExisted) {
        mkdirSync(path.dirname(snapshot.marketplaceManifestPath), { recursive: true });
        rmSync(snapshot.marketplaceManifestPath, { force: true });
        cpSync(snapshot.marketplaceManifestBackup, snapshot.marketplaceManifestPath);
    }
    else {
        rmSync(snapshot.marketplaceManifestPath, { force: true });
    }
}
export function cleanupInstallSnapshot(snapshot) {
    rmSync(snapshot.snapshotRoot, { recursive: true, force: true });
}
