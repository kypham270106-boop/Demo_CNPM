import english from "./en.json";
export type Language = "vi" | "en";
const dictionary: Record<string, string> = english;
// Several Vietnamese labels share an English translation; keep the first label stable.
const vietnamese: Record<string, string> = {};
for (const [vi, en] of Object.entries(dictionary)) {
  vietnamese[en] ??= vi;
}
export function translate(text: string, language: Language) {
  const key = text.trim().replace(/\s+/g, " ");
  const result = language === "vi" ? vietnamese[key] : dictionary[key];
  if (!result) return text;
  return (text.match(/^\s+/)?.[0] ?? "") + result + (text.match(/\s+$/)?.[0] ?? "");
}
