import { deleteCodexPlugin, getPendingCodexPluginDeleteActions } from "../install/codex-plugin-delete.js";
import { PLUGIN_REF } from "../install/codex-plugin-install.js";
import { formatCheckPreview, printLines } from "./destructive-action-preview.js";

export function runDelete(argv) {
  const check = parseDeleteArgs(argv).check === true;
  const { actions } = getPendingCodexPluginDeleteActions();
  if (check) {
    const lines = formatCheckPreview("delete", actions);
    printLines(lines);
    if (actions.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  deleteCodexPlugin();
  if (actions.length === 0) {
    console.log("lfp delete: nothing to remove");
    return;
  }
  for (const action of actions) console.log(`removed ${action.replace(/^remove /, "")}`);
  console.log(`lfp delete: removed ${PLUGIN_REF}`);
}

function parseDeleteArgs(argv) {
  const parsed = {};
  for (const item of argv) {
    if (item === "--check") {
      parsed.check = true;
      continue;
    }
    throw new Error(`Unknown delete option: ${item}`);
  }
  return parsed;
}
