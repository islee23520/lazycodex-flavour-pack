export function createProviderConsentSelector(prompts) {
  return async ({ question }) => {
    const wantProvider = await confirmOrCancel(prompts, cleanYesNoQuestion(question), false);
    if (!wantProvider) return false;

    const useCustom = await confirmOrCancel(
      prompts,
      "Use a custom provider instead of the default OpenAI-compatible config?",
      false
    );
    if (!useCustom) return true;

    const id = await textOrCancel(prompts, {
      message: "Provider id",
      placeholder: "openai-compatible",
      defaultValue: "openai-compatible"
    });
    const baseUrl = await textOrCancel(prompts, {
      message: "Provider base URL",
      placeholder: "https://api.openai.com/v1"
    });
    const wireApi = await selectOrCancel(prompts, {
      message: "Wire API",
      options: [
        { value: "responses", label: "responses" },
        { value: "chat", label: "chat" }
      ],
      initialValue: "responses"
    });
    const apiKeyEnv = await textOrCancel(prompts, {
      message: "API key environment variable name",
      placeholder: "OPENAI_API_KEY"
    });

    return { id: String(id), baseUrl: String(baseUrl), wireApi: String(wireApi), envKey: String(apiKeyEnv) };
  };
}

function cleanYesNoQuestion(question) {
  return String(question || "").replace(/\s*\[y\/N\]\s*:?\s*$/i, "").trim() || question;
}

async function confirmOrCancel(prompts, message, initialValue) {
  const answer = await prompts.confirm({ message, initialValue });
  ensureNotCancelled(prompts, answer);
  return answer;
}

async function textOrCancel(prompts, options) {
  const answer = await prompts.text(options);
  ensureNotCancelled(prompts, answer);
  return answer;
}

async function selectOrCancel(prompts, options) {
  const answer = await prompts.select(options);
  ensureNotCancelled(prompts, answer);
  return answer;
}

function ensureNotCancelled(prompts, value) {
  if (!prompts.isCancel(value)) return;
  prompts.cancel("LFP setup cancelled.");
  throw new Error("LFP setup cancelled");
}
