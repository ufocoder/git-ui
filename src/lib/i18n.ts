import ru from "../../locales/ru.json" with { type: "json" };

export type TranslationKey = keyof typeof ru;
type Parameters = Record<string, string | number>;
export const locale = "ru-RU";

/** Replace named placeholders once, without interpreting text supplied by Git. */
export function t(key: TranslationKey, parameters: Parameters = {}): string {
  return ru[key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : placeholder);
}
