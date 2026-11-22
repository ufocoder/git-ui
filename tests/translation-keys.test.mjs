import assert from 'node:assert/strict';
import test from 'node:test';
import { translationKeys } from '../scripts/translation-keys.mjs';

test('translation inspection understands conditional TypeScript and JSX without matching comments', () => {
  const source = `
    // t("unused.comment")
    const example = 't("unused.string")';
    const label = t(checked ? "stage.unstage-matches" : "stage.stage-matches", { path: "unused.parameter" });
    const view = <span>{t(("settings.title" as const))}</span>;
    t(\`common.cancel\`);
  `;
  assert.deepEqual(translationKeys('view.tsx', source).sort(), ['common.cancel', 'settings.title', 'stage.stage-matches', 'stage.unstage-matches']);
});
