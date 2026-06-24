export function getTableBlock(text, tableName) {
    const pattern = new RegExp(`(^|\\n)\\[${escapeRegExp(tableName)}]\\n([\\s\\S]*?)(?=\\n\\[[^\\n]+]|$)`);
    return pattern.exec(text)?.[2] ?? "";
}
export function readTopLevelTomlString(text, key) {
    const firstTable = /^\[[^\n]+]/m.exec(text);
    const topLevel = firstTable === null ? text : text.slice(0, firstTable.index);
    return readTomlString(topLevel, key);
}
export function readTomlString(text, key) {
    const match = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, "m").exec(text);
    return match?.[1] ?? null;
}
export function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
