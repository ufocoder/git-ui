import assert from 'node:assert/strict';
import test from 'node:test';
import { cn } from '../src/lib/utils.ts';

test('compact component sizes override theme defaults', () => {
  assert.equal(cn('h-control px-control-x', 'h-8 px-3'), 'h-8 px-3');
  assert.equal(cn('h-control-sm', 'h-7'), 'h-7');
  assert.equal(cn('h-8', 'h-control-toolbar'), 'h-control-toolbar');
});

test('theme font sizes override sizes without removing text colors', () => {
  assert.equal(cn('text-sm text-muted-foreground', 'text-2xs'), 'text-muted-foreground text-2xs');
  assert.equal(cn('text-2xs leading-4', 'text-diff leading-diff'), 'text-diff leading-diff');
});
