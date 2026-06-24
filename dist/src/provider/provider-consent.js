import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const LEDGER_DIR = ".ledger";
const PROVIDER_CONSENT_FILE = "openai-compatible-provider-consent.json";
export function getProviderConsentPath(options = {}) {
    const env = options.env ?? process.env;
    const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
    return options.providerConsentPath ?? path.join(codexHome, LEDGER_DIR, "lfp", PROVIDER_CONSENT_FILE);
}
export function readProviderConsent(options = {}) {
    const consentPath = getProviderConsentPath(options);
    if (!existsSync(consentPath))
        return null;
    const parsed = JSON.parse(readFileSync(consentPath, "utf8"));
    if (parsed.installOpenAiCompatProvider === true)
        return true;
    if (parsed.installOpenAiCompatProvider === false)
        return false;
    return null;
}
export function saveProviderConsent(installOpenAiCompatProvider, options = {}) {
    const consentPath = getProviderConsentPath(options);
    mkdirSync(path.dirname(consentPath), { recursive: true });
    writeFileSync(consentPath, `${JSON.stringify({
        installOpenAiCompatProvider,
        recordedAt: new Date().toISOString()
    }, null, 2)}\n`);
    return consentPath;
}
