import { createSignal } from "solid-js";
import ru from "../../locales/ru.json" with { type: "json" };
import en from "../../locales/en.json" with { type: "json" };
import zh from "../../locales/zh.json" with { type: "json" };

export type TranslationKey = keyof typeof ru;
export type Language = "ru" | "en" | "zh";
type Parameters = Record<string, string | number>;
const dictionaries: Record<Language, Record<TranslationKey, string>> = { ru, en, zh };
const locales: Record<Language, string> = { ru: "ru-RU", en: "en-US", zh: "zh-CN" };
export const [language, setLanguage] = createSignal<Language>("ru");
export const locale = () => locales[language()];
export const normalizeLanguage = (value: unknown): Language => value === "en" || value === "zh" ? value : "ru";

export function preferredLanguage(tags: readonly string[]): Language {
  for (const tag of tags) {
    const code = tag.split(/[-_]/)[0].toLowerCase();
    if (code === "ru" || code === "en" || code === "zh") return code;
  }
  return "ru";
}

/** Replace named placeholders once, without interpreting text supplied by Git. */
export function t(key: TranslationKey, parameters: Parameters = {}): string {
  return dictionaries[language()][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : placeholder);
}
