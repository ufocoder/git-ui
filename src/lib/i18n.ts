import { createSignal } from "solid-js";
import ru from "../../locales/ru.json" with { type: "json" };
import en from "../../locales/en.json" with { type: "json" };

export type TranslationKey = keyof typeof ru;
export type Language = "ru" | "en";
type Parameters = Record<string, string | number>;
const dictionaries: Record<Language, Record<TranslationKey, string>> = { ru, en };
export const [language, setLanguage] = createSignal<Language>("ru");
export const locale = () => language() === "en" ? "en-US" : "ru-RU";
export const normalizeLanguage = (value: unknown): Language => value === "en" ? "en" : "ru";

/** Replace named placeholders once, without interpreting text supplied by Git. */
export function t(key: TranslationKey, parameters: Parameters = {}): string {
  return dictionaries[language()][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : placeholder);
}
