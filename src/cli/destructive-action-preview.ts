export function formatCheckPreview(command: "delete" | "undo", actions: string[]): string[] {
  if (command === "delete") {
    if (actions.length === 0) {
      return ["lfp delete: nothing to remove"];
    }
    return ["lfp delete: would remove:", ...actions.map((a) => `would ${a}`)];
  }
  if (actions.length === 0) {
    return ["lfp undo: nothing to undo"];
  }
  return ["lfp undo: would restore LazyCodex original surface:", ...actions.map((a) => `would ${a}`)];
}

export function printLines(lines: string[], output = console): void {
  for (const line of lines) {
    output.log(line);
  }
}
