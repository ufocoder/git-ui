import assert from 'node:assert/strict';
import test from 'node:test';
import { screenshotLanguage } from '../website/screenshot.js';

test('landing screenshot follows the first supported browser language', () => {
  assert.equal(screenshotLanguage(['ru-RU', 'en-US']), 'ru');
  assert.equal(screenshotLanguage(['zh-Hans-CN', 'en-US']), 'zh');
  assert.equal(screenshotLanguage(['en-GB', 'ru']), 'en');
  assert.equal(screenshotLanguage(['fr-FR', 'zh_TW']), 'zh');
});

test('unsupported or missing browser languages use the English screenshot', () => {
  assert.equal(screenshotLanguage([]), 'en');
  assert.equal(screenshotLanguage(['de-DE', 'fr']), 'en');
  assert.equal(screenshotLanguage([null, '']), 'en');
});
