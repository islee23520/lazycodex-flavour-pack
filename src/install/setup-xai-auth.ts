import { importGrokXaiAuth } from "../xai/xai-auth.js";

export function maybeImportXaiAuthDuringSetup(options = {}) {
  const result = importGrokXaiAuth(options);
  if (result.imported) {
    console.log(`imported xAI OAuth credentials from Grok into ${result.targetPath}`);
    console.log("xAI MCP OAuth auth is available through LFP; MCP servers were not registered.");
    return result;
  }
  if (result.preserved) {
    console.log(`preserved existing xAI OAuth credentials in ${result.targetPath}`);
  }
  return result;
}
