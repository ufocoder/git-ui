import assert from "node:assert/strict";
import test from "node:test";
import { matchesShortcut, shortcutLabels } from "../src/lib/keyboard-shortcuts.ts";

const key = (value, modifiers = {}) => ({ key: value, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...modifiers });

test("refresh accepts the platform modifiers but does not capture hard reload", () => {
  assert.ok(matchesShortcut("refresh", key("r", { metaKey: true })));
  assert.ok(matchesShortcut("refresh", key("R", { ctrlKey: true })));
  assert.ok(!matchesShortcut("refresh", key("r")));
  assert.ok(!matchesShortcut("refresh", key("r", { metaKey: true, shiftKey: true })));
  assert.ok(!matchesShortcut("refresh", key("r", { ctrlKey: true, altKey: true })));
  assert.deepEqual(shortcutLabels("refresh", true), ["⌘R"]);
  assert.deepEqual(shortcutLabels("refresh", false), ["Ctrl+R"]);
});

test("contextual shortcuts match only their documented keys and modifiers", () => {
  assert.ok(matchesShortcut("help", key("F1")));
  assert.ok(matchesShortcut("selectCommit", key("Enter")));
  assert.ok(matchesShortcut("selectCommit", key(" ")));
  assert.ok(!matchesShortcut("selectCommit", key("Enter", { ctrlKey: true })));
  assert.ok(matchesShortcut("sidebarResize", key("ArrowLeft", { shiftKey: true })));
  assert.ok(!matchesShortcut("sidebarBounds", key("Home", { ctrlKey: true })));
  assert.ok(matchesShortcut("dismiss", key("Escape")));
});
