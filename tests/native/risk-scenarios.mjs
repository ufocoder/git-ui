import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function prepareRiskRepositories(root, history, git) {
 const commit=async(path,name,text,file='file.txt')=>{await writeFile(join(path,file),text);git(path,'add','--all');git(path,'commit','-m',name);return git(path,'rev-parse','HEAD');};
 const resetBase=git(history,'rev-parse','HEAD');
 await commit(history,'Second change','second\n');
 await commit(history,'Third change','third\n');
 const rebase=join(root,'rebase-project');
 await mkdir(rebase);git(rebase,'init','-b','main');git(rebase,'config','user.name','UI Test');git(rebase,'config','user.email','ui@example.com');git(rebase,'config','commit.gpgsign','false');
 await commit(rebase,'Shared base','base\n');
 git(rebase,'checkout','-b','feature');await commit(rebase,'Feature change','feature\n','feature.txt');
 git(rebase,'checkout','main');await commit(rebase,'Main change','main\n','main.txt');git(rebase,'checkout','feature');
 const conflict=rebase;
 async function prepareConflict(){
  git(conflict,'checkout','-b','conflict-other');await commit(conflict,'Incoming conflict','theirs\n');
  git(conflict,'checkout','feature');await commit(conflict,'Current conflict','ours\n');
  try {git(conflict,'merge','--no-edit','conflict-other');assert.fail('fixture must conflict');}catch {assert.ok(git(conflict,'diff','--name-only','--diff-filter=U'));}
 }

 return {rebase,conflict,resetBase,commit,prepareConflict};
}

export async function runRiskScenarios(ctx, fixtures) {
 const {command,element,click,fill,contains,screenshot,until,git,repo,history,switchProject,refresh}=ctx;
 const exact=text=>`//button[normalize-space(.)=${JSON.stringify(text)}]`;
 const row=subject=>`//*[@data-commit-index and contains(.,${JSON.stringify(subject)})]`;
 async function rightClick(selector){
  const id=await element(selector);
  await command('/actions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,origin:{'element-6066-11e4-a52e-4f735466cecf':id},x:0,y:0},{type:'pointerDown',button:2},{type:'pointerUp',button:2}]}]});
 }
 const menu=text=>`//*[@role="menuitem" and starts-with(normalize-space(.),${JSON.stringify(text)})]`;
 const confirm='//*[@role="dialog"]//label[.//input[@type="checkbox"]]/div/*[last()]';
 // The discard backup is restored through the visible Stash dialog.
 await switchProject('smoke-project');
 await click('//nav//button[contains(.,"Stash")]');await click(exact('Apply Stash'));await click(exact('Apply'));
 await until(async()=>(await readFile(join(repo,'file.txt'),'utf8'))==='discard me\n','Stash restored saved content');
 assert.ok(git(repo,'stash','list'),'applying must not drop the recovery copy');await screenshot('stash-restored');
 // Hard reset must remain blocked until the explicit confirmation is checked.
 await switchProject('history-project');await click(exact('Commit tree'));await contains('Third change');
 const original=git(history,'rev-parse','HEAD');
 await writeFile(join(history,'file.txt'),'uncommitted\n');await refresh();
 await rightClick(row('Initial commit'));await click(menu('Reset branch to commit'));await click(exact('Hard'));
 const reset=await element(exact('Reset'));
 assert.equal(await command(`/element/${reset}/enabled`),false);
 assert.equal(git(history,'rev-parse','HEAD'),original);
 await screenshot('hard-reset-confirmation');await click(confirm);await click(exact('Reset'));
 await until(()=>git(history,'rev-parse','HEAD')===fixtures.resetBase,'hard reset target');
 assert.equal(await readFile(join(history,'file.txt'),'utf8'),'base\n');assert.equal(git(history,'status','--porcelain'),'');
 await screenshot('hard-reset-result');
 // Build a fresh linear range; selection, squash and recovery all run through UI.
 await fixtures.commit(history,'Second change','second\n');const beforeSquash=await fixtures.commit(history,'Third change','third\n');await refresh();await contains('Third change');
 await click(row('Third change'));
 await command('/actions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'\uE008'},{type:'keyDown',value:'\uE015'},{type:'keyUp',value:'\uE015'},{type:'keyUp',value:'\uE008'}]}]});
 await rightClick(row('Third change'));await click(menu('Squash commits'));
 await fill('//*[@role="dialog"]//textarea','Squashed UI changes');
 await click(confirm);await click(exact('Squash'));
 await until(()=>git(history,'log','-1','--format=%s')==='Squashed UI changes','squash result');
 assert.equal(git(history,'rev-list','--count','HEAD'),'2');assert.equal(await readFile(join(history,'file.txt'),'utf8'),'third\n');
 await screenshot('squash-result');await click(exact('Restore history'));
 await until(()=>git(history,'rev-parse','HEAD')===beforeSquash,'original history restored');
 assert.equal(git(history,'rev-list','--count','HEAD'),'3');assert.equal(await readFile(join(history,'file.txt'),'utf8'),'third\n');await screenshot('history-restored');
 // Rebase a feature branch onto a main branch with a distinct file change.
 await switchProject('rebase-project');await click(exact('Commit tree'));
 await rightClick('//button[@title="main"]');await click(menu('Rebase on branch'));
 await click('//*[@role="dialog"]//button[normalize-space(.)="Rebase on branch"]');
 await until(()=>git(fixtures.rebase,'merge-base','HEAD','main')===git(fixtures.rebase,'rev-parse','main'),'rebase ancestry');
 assert.equal(await readFile(join(fixtures.rebase,'feature.txt'),'utf8'),'feature\n');assert.equal(await readFile(join(fixtures.rebase,'main.txt'),'utf8'),'main\n');
 assert.equal(git(fixtures.rebase,'status','--porcelain'),'');await screenshot('rebase-result');
 // Resolve a real merge conflict and finish the merge from the application.
 await fixtures.prepareConflict();await refresh();await contains('Conflicts');
 await click('//nav//button[contains(.,"Conflicts")]');
 await click('//*[@data-file-scroll]//*[self::button or @role="treeitem"][contains(.,"file.txt")]');
 await click(exact('Whole file: current'));await click(exact('Save and mark resolved'));
 await until(()=>git(fixtures.conflict,'diff','--name-only','--diff-filter=U')==='','conflict staged');
 assert.equal(await readFile(join(fixtures.conflict,'file.txt'),'utf8'),'ours\n');
 await screenshot('conflict-resolved');await click(exact('Continue'));
 await until(()=>git(fixtures.conflict,'rev-list','--parents','-n','1','HEAD').split(' ').length===3,'merge completed');
 assert.equal(git(fixtures.conflict,'status','--porcelain'),'');await screenshot('merge-completed');
}
