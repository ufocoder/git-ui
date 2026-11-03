import assert from 'node:assert/strict';
import test from 'node:test';
import { splitCommitMessage, composeCommitMessage } from '../src/lib/commit-message.ts';

test('separates title and optional body for existing and amended commits', () => {
  assert.deepEqual(splitCommitMessage('Title'), { subject: 'Title', body: '' });
  assert.deepEqual(splitCommitMessage('Title\n\nFirst paragraph\n\nSecond paragraph'), { subject: 'Title', body: 'First paragraph\n\nSecond paragraph' });
  assert.deepEqual(splitCommitMessage('Title\r\n\r\nBody'), { subject: 'Title', body: 'Body' });
  assert.deepEqual(splitCommitMessage('Title\nBody'), { subject: 'Title', body: 'Body' });
});

test('composes Git messages with a blank separator and preserves draft whitespace', () => {
  assert.equal(composeCommitMessage('Title', ''), 'Title');
  assert.equal(composeCommitMessage('Title', 'Body\n\nDetails'), 'Title\n\nBody\n\nDetails');
  assert.equal(composeCommitMessage('', 'Draft body'), '\n\nDraft body');
  const draft = 'Title \n\n  Detail\n';
  const parts = splitCommitMessage(draft);
  assert.equal(composeCommitMessage(parts.subject, parts.body), draft);
});
