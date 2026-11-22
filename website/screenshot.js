export function screenshotLanguage(languages) {
  for (const tag of languages) {
    if (typeof tag !== 'string') continue;
    const language = tag.toLowerCase().split(/[-_]/)[0];
    if (['en', 'ru', 'zh'].includes(language)) return language;
  }
  return 'en';
}
