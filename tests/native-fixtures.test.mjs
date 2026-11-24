import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareRiskRepositories } from './native/risk-scenarios.mjs';

test('native risk fixtures contain a linear reset range, divergent rebase and real merge conflict',async t=>{
 const root=await mkdtemp(join(tmpdir(),'git-ui-native-fixture-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5}));
 const git=(path,...args)=>execFileSync('git',['-C',path,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const history=join(root,'history');await mkdir(history);git(history,'init');git(history,'config','user.name','Test');git(history,'config','user.email','test@example.com');git(history,'config','commit.gpgsign','false');
 await writeFile(join(history,'file.txt'),'base\n');git(history,'add','.');git(history,'commit','-m','Initial commit');
 const fixtures=await prepareRiskRepositories(root,history,git);
 assert.equal(git(history,'rev-list','--count','HEAD'),'3');assert.equal(git(history,'rev-parse','HEAD~2'),fixtures.resetBase);
 assert.notEqual(git(fixtures.rebase,'merge-base','main','feature'),git(fixtures.rebase,'rev-parse','main'));
 await fixtures.prepareConflict();
 assert.equal(git(fixtures.conflict,'diff','--name-only','--diff-filter=U'),'file.txt');
 assert.equal(git(fixtures.conflict,'show',':2:file.txt'),'ours');assert.equal(git(fixtures.conflict,'show',':3:file.txt'),'theirs');
});
