import { Show, createSignal } from "solid-js";
import { SelectField } from "~/components/ui/select";
import { language, t, type Language } from "~/lib/i18n";
import { saveLanguage } from "~/lib/language-preferences";
import { uiFontScale } from "~/lib/appearance-preferences";

export default function AppearanceSettings(props: { pending: boolean; setPending: (pending: boolean) => void }) {
  const [languageError, setLanguageError] = createSignal("");
  async function chooseLanguage(value: Language) {
    props.setPending(true); setLanguageError("");
    try { await saveLanguage(value); } catch (error) { setLanguageError(String(error)); }
    finally { props.setPending(false); }
  }
  return <>
    <SelectField label={t("language.title")} value={language()} disabled={props.pending} onChange={value => void chooseLanguage(value as Language)}
      options={[{ value: "ru", label: t("language.russian") }, { value: "en", label: t("language.english") }]} />
    <Show when={languageError()}><p role="alert" class="text-sm text-destructive">{t("language.save-error", { error: languageError() })}</p></Show>
    <SelectField label={t("appearance.font-size")} value={String(uiFontScale.value())} onChange={value => uiFontScale.save(Number(value))}
      options={uiFontScale.choices.map((value, index) => ({
        value: String(value),
        label: [t("appearance.font-small"), t("appearance.font-below-medium"), t("appearance.font-medium"), t("appearance.font-above-medium"), t("appearance.font-large")][index],
      }))} />
  </>;
}
