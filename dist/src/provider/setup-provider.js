import { createInterface } from "node:readline";
import { getProviderConsentPath, readProviderConsent, saveProviderConsent } from "./provider-consent.js";
export function resolveProviderOverride(args, options = {}) {
    const env = options.env ?? process.env;
    const id = args.providerId ?? (env.LFP_PROVIDER_ID?.trim() || null);
    const baseUrl = args.providerBaseUrl ?? (env.LFP_PROVIDER_BASE_URL?.trim() || null);
    const wireApi = args.providerWireApi ?? (env.LFP_PROVIDER_WIRE_API?.trim() || null);
    const apiKeyEnv = args.providerApiKeyEnv ?? (env.LFP_PROVIDER_API_KEY_ENV?.trim() || null);
    const provided = [id, baseUrl, wireApi, apiKeyEnv].filter((value) => value !== null);
    if (provided.length === 0)
        return null;
    if (provided.length !== 4) {
        throw new Error("Provider override requires all four values: --provider-id / LFP_PROVIDER_ID, --provider-base-url / LFP_PROVIDER_BASE_URL, --provider-wire-api / LFP_PROVIDER_WIRE_API, --provider-api-key-env / LFP_PROVIDER_API_KEY_ENV");
    }
    if (!["responses", "chat"].includes(wireApi)) {
        throw new Error(`Invalid provider wire API: ${wireApi}. Must be one of: responses, chat.`);
    }
    return { id, baseUrl, wireApi, requiresOpenAiAuth: true, envKey: apiKeyEnv };
}
export async function shouldInstallOpenAiCompatProvider(state, selectorOptions = {}, providerOverride = null) {
    if (state.anyModelProviderConfigured) {
        console.log("lfp setup: model provider already configured; leaving existing provider untouched.");
        return false;
    }
    if (providerOverride) {
        validateProviderEnv(providerOverride, selectorOptions, "--provider-api-key-env / LFP_PROVIDER_API_KEY_ENV");
        return true;
    }
    const savedConsent = readProviderConsent();
    if (savedConsent !== null) {
        console.log(`lfp setup: model provider install consent recorded as ${savedConsent ? "yes" : "no"} in ${getProviderConsentPath()}.`);
        return savedConsent;
    }
    if (!process.stdin.isTTY) {
        console.log("lfp setup: model provider missing; skipping provider install in non-interactive mode.");
        return false;
    }
    if (typeof selectorOptions.providerConsentSelector === "function") {
        return await promptWithSelector(state, selectorOptions);
    }
    return await promptWithReadline(state, selectorOptions);
}
function validateProviderEnv(provider, options, suffix) {
    const env = options.env ?? process.env;
    if (!env[provider.envKey]?.trim()) {
        throw new Error(`Provider override requires ${provider.envKey} environment variable to be set (${suffix}).`);
    }
}
async function promptWithSelector(state, selectorOptions) {
    const result = await selectorOptions.providerConsentSelector({
        question: `Install OpenAI-compatible model provider ${state.openAiCompatProvider.id} in ${state.configPath}? [y/N]: `
    });
    if (result && typeof result === "object" && result.id) {
        const providerOverride = {
            id: result.id,
            baseUrl: result.baseUrl,
            wireApi: result.wireApi,
            requiresOpenAiAuth: true,
            envKey: result.envKey
        };
        validateProviderEnv(providerOverride, selectorOptions, "provider selector");
        return { providerOverride };
    }
    const answer = !!result;
    const consentPath = saveProviderConsent(answer);
    console.log(`lfp setup: recorded model provider install consent in ${consentPath}.`);
    return answer;
}
async function promptWithReadline(state, selectorOptions) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await promptForYesNo(rl, `Install OpenAI-compatible model provider ${state.openAiCompatProvider.id} in ${state.configPath}? [y/N]: `, { yesNoSelector: selectorOptions.yesNoSelector });
        const consentPath = saveProviderConsent(answer);
        console.log(`lfp setup: recorded model provider install consent in ${consentPath}.`);
        return answer;
    }
    finally {
        rl.close();
    }
}
async function promptForYesNo(rl, question, options = {}) {
    if (typeof options.yesNoSelector === "function")
        return !!(await options.yesNoSelector({ question }));
    const answer = await new Promise((resolve) => {
        rl.question(question, resolve);
    });
    return /^y(?:es)?$/i.test(String(answer).trim());
}
