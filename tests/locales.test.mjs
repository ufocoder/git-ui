import { translationKeys } from "../scripts/translation-keys.mjs";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ru from "../locales/ru.json" with { type: "json" };
import en from "../locales/en.json" with { type: "json" };
import zh from "../locales/zh.json" with { type: "json" };
import { language, locale, normalizeLanguage, preferredLanguage, setLanguage, t } from "../src/lib/i18n.ts";

const root = new URL("../", import.meta.url);
function files(directory) {
  if (directory instanceof URL) directory = fileURLToPath(directory);
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : [filename];
  });
}

test("all frontend and backend translation keys exist in the shared dictionary", () => {
  const sources = [
    ...files(new URL("src", root)),
    ...files(new URL("src-tauri/src", root)),
  ].filter(filename => /\.(tsx?|rs)$/.test(filename));
  const html = readFileSync(new URL("index.html", root), "utf8");
  const used = new Set(Array.from(html.matchAll(/\{\{([a-z0-9.-]+)\}\}/g), match => match[1]));
  for (const filename of sources) {
    const source = readFileSync(filename, "utf8");
    for (const key of translationKeys(filename, source)) {
      assert.equal(typeof ru[key], "string", `${filename}: ${key}`);
      used.add(key);
    }
  }
  for (const [key, value] of Object.entries(ru)) {
    assert.ok(value.length > 0, key);
    assert.match(key, /^[a-z]+(?:-[a-z]+)*(?:\.[a-z]+(?:-[a-z]+)*)+$/);
    assert.ok(used.has(key), `Unused key: ${key}`);
  }
});

test("interpolation preserves Git text and does not replace placeholders inside parameters", () => {
  const name = "feature/{p2}/$&";
  assert.equal(t("sidebar.comparison", { p1: name, p2: 2, p3: 0 }),
    `Относительно ${name}: впереди на 2, позади на 0`);
  assert.equal(t("commit.staged-count", { count: 0, total: 4 }), "Staged: 0 из 4");
  assert.equal(t("diff.previous-name", { path: "/project/{path}" }), "Прежнее имя: /project/{path}");
});

test("production sources contain no hardcoded Russian UI text", () => {
  for (const filename of files(new URL("src", root)).filter(file => /\.tsx?$/.test(file))) {
    assert.doesNotMatch(readFileSync(filename, "utf8"), /[А-Яа-яЁё]/, filename);
  }
  const backend = readFileSync(new URL("src-tauri/src/lib.rs", root), "utf8").split("#[cfg(test)]")[0];
  assert.doesNotMatch(backend, /[А-Яа-яЁё]/);
});

for (const [name, dictionary] of Object.entries({ English: en, Chinese: zh })) {
  test(`${name} has all keys and preserves interpolation placeholders`, () => {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(ru).sort());
    const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const [key, value] of Object.entries(dictionary)) {
      assert.ok(value.length > 0, key);
      assert.deepEqual(placeholders(value), placeholders(ru[key]), key);
      if (key !== "language.russian") assert.doesNotMatch(value, /[А-Яа-яЁё]/, key);
    }
  });
}

test("Russian is the default and language switches translations and date locale", () => {
  assert.equal(language(), "ru");
  assert.equal(normalizeLanguage(null), "ru");
  assert.equal(normalizeLanguage("fr"), "ru");
  assert.equal(normalizeLanguage("en"), "en");
  try {
    setLanguage("en");
    assert.equal(t("commit.create"), "Create commit");
    assert.equal(t("sidebar.comparison", { p1: "feature/{p2}", p2: 2, p3: 0 }), "Compared with feature/{p2}: 2 ahead, 0 behind");
    assert.equal(locale(), "en-US");
  } finally { setLanguage("ru"); }
  assert.equal(locale(), "ru-RU");
  assert.equal(t("commit.create"), ru["commit.create"]);
});

test("Chinese switches translations, date locale and normalization", () => {
  assert.equal(normalizeLanguage("zh"), "zh");
  try {
    setLanguage("zh");
    assert.equal(t("commit.create"), "创建提交");
    assert.equal(locale(), "zh-CN");
    const name = "feature/{p2}/$&";
    assert.equal(t("sidebar.comparison", { p1: name, p2: 2, p3: 0 }),
      `相对于 ${name}：领先 2 个提交，落后 0 个提交`);
  } finally { setLanguage("ru"); }
});

test("preferredLanguage resolves supported system tags in order", () => {
  assert.equal(preferredLanguage(["zh-CN", "en-US"]), "zh");
  assert.equal(preferredLanguage(["zh-Hans"]), "zh");
  assert.equal(preferredLanguage(["zh-TW"]), "zh");
  assert.equal(preferredLanguage(["zh_Hans_CN"]), "zh");
  assert.equal(preferredLanguage(["en-US", "zh-CN"]), "en");
  assert.equal(preferredLanguage(["fr-FR", "zh-CN"]), "zh");
  assert.equal(preferredLanguage([]), "ru");
  assert.equal(preferredLanguage(["fr-FR"]), "ru");
  assert.equal(preferredLanguage(["RU_ru"]), "ru");
});
