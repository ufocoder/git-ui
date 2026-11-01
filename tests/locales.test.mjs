import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ru from "../locales/ru.json" with { type: "json" };
import en from "../locales/en.json" with { type: "json" };
import { language, locale, normalizeLanguage, setLanguage, t } from "../src/lib/i18n.ts";

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
  const used = new Set();
  for (const filename of sources) {
    const source = readFileSync(filename, "utf8");
    for (const match of source.matchAll(/\b(?:t|locale::text|locale::format|failure)\(\s*"([\w]+)"/g)) {
      assert.equal(typeof ru[match[1]], "string", `${filename}: ${match[1]}`);
      used.add(match[1]);
    }
  }
  for (const [key, value] of Object.entries(ru)) {
    assert.ok(value.length > 0, key);
    assert.match(key, /^[a-zA-Z]+\d*$/);
    assert.ok(used.has(key) || key === "noJs", `Unused key: ${key}`);
  }
});

test("interpolation preserves Git text and does not replace placeholders inside parameters", () => {
  const name = "feature/{p2}/$&";
  assert.equal(t("repo05", { p1: name, p2: 2, p3: 0 }),
    `Относительно ${name}: впереди на 2, позади на 0`);
  assert.equal(t("commit05", { count: 0, total: 4 }), "Staged: 0 из 4");
  assert.equal(t("diff02", { path: "/project/{path}" }), "Прежнее имя: /project/{path}");
});

test("production sources contain no hardcoded Russian UI text", () => {
  for (const filename of files(new URL("src", root)).filter(file => /\.tsx?$/.test(file))) {
    assert.doesNotMatch(readFileSync(filename, "utf8"), /[А-Яа-яЁё]/, filename);
  }
  const backend = readFileSync(new URL("src-tauri/src/lib.rs", root), "utf8").split("#[cfg(test)]")[0];
  assert.doesNotMatch(backend, /[А-Яа-яЁё]/);
});

test("English has all keys and preserves interpolation placeholders", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort());
  const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.length > 0, key);
    assert.deepEqual(placeholders(value), placeholders(ru[key]), key);
    if (key !== "lang02") assert.doesNotMatch(value, /[А-Яа-яЁё]/, key);
  }
});

test("Russian is the default and language switches translations and date locale", () => {
  assert.equal(language(), "ru");
  assert.equal(normalizeLanguage(null), "ru");
  assert.equal(normalizeLanguage("fr"), "ru");
  assert.equal(normalizeLanguage("en"), "en");
  try {
    setLanguage("en");
    assert.equal(t("commit15"), "Create commit");
    assert.equal(t("repo05", { p1: "feature/{p2}", p2: 2, p3: 0 }), "Compared with feature/{p2}: 2 ahead, 0 behind");
    assert.equal(locale(), "en-US");
  } finally { setLanguage("ru"); }
  assert.equal(locale(), "ru-RU");
  assert.equal(t("commit15"), ru.commit15);
});
