import { prepareRiskRepositories, runRiskScenarios } from "./risk-scenarios.mjs";
// Drives the built application through its native WebView; no mocked Git IPC.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

if(process.platform!=='win32') throw new Error('Native smoke suite requires Windows and tauri-driver with matching msedgedriver.');
const root=await mkdtemp(join(tmpdir(),'git-ui-native-'));
// Windows known-folder APIs do not reliably honor an overridden APPDATA.
// Build with the dedicated test identifier instead of touching the normal profile.
const settings=join(process.env.APPDATA,'com.ufocoder.git-ui.e2e');
const repo=join(root,'smoke-project'), second=join(root,'history-project');
const artifacts=resolve('test-results/native');await mkdir(artifacts,{recursive:true});
function git(path,...args){return execFileSync('git',['-C',path,...args],{encoding:'utf8'}).trim();}
for(const path of [repo,second]){
 await mkdir(path);git(path,'init');git(path,'config','user.name','UI Test');git(path,'config','user.email','ui@example.com');git(path,'config','commit.gpgsign','false');
 await writeFile(join(path,'file.txt'),'base\n');git(path,'add','.');git(path,'commit','-m','Initial commit');
}
const fixtures=await prepareRiskRepositories(root,second,git);
await writeFile(join(repo,'file.txt'),'changed\n');
await mkdir(settings);
await writeFile(join(settings,'recent-projects.json'),JSON.stringify([repo,second,fixtures.rebase]));
await writeFile(join(settings,'language.json'),'"en"');
const driver=spawn('msedgedriver.exe',['--port=4444','--verbose',`--log-path=${join(artifacts,'edge-driver.log')}`],{
 env:{...process.env,TAURI_AUTOMATION:'true',TAURI_WEBVIEW_AUTOMATION:'true'},stdio:['ignore','pipe','pipe'],
});
driver.on('error',error=>{console.error('Unable to start Edge WebDriver:',error);});
let logs='';driver.stdout.on('data',chunk=>{logs+=chunk;});driver.stderr.on('data',chunk=>{logs+=chunk;});
let session;
async function request(path,body,method=body===undefined?'GET':'POST'){
 const response=await fetch('http://127.0.0.1:4444'+path,{method,body:body===undefined?undefined:JSON.stringify(body),headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(path==='/session'?180000:30000)});
 const result=await response.json();if(result.value?.error)throw new Error(JSON.stringify(result.value));return result.value;
}
const command=(path,body,method)=>request(`/session/${session}${path}`,body,method);
async function until(read,description){
 const deadline=Date.now()+20000;let last;
 while(Date.now()<deadline){try{const value=await read();if(value)return value;}catch(error){last=error;}await delay(100);}
 throw new Error(`Timed out: ${description}. ${last??''}`);
}
const xpath=text=>`//button[contains(normalize-space(.),${JSON.stringify(text)})]`;
async function element(value,using='xpath'){return until(async()=>{const e=await command('/element',{using,value});return e['element-6066-11e4-a52e-4f735466cecf'];},value);}
async function click(value,using){const id=await element(value,using);await until(async()=>{await command(`/element/${id}/click`,{});return true;},value);}
async function contains(text){return until(async()=>String(await command('/source')).includes(text),text);}
async function screenshot(name){await writeFile(join(artifacts,`${name}.png`),Buffer.from(await command('/screenshot'),'base64'));}
async function refresh(){await command('/execute/sync',{script:'window.dispatchEvent(new Event("focus")); return true;',args:[]});}
async function switchProject(name){
 await click('//button[@aria-haspopup="dialog" and starts-with(@aria-label,"Switch")]');
 await click(xpath(name));
 await until(async()=>String(await command('/title')).includes(name),`project ${name}`);
}

try{
 await until(()=>request('/status'),'WebDriver startup');
 const created=await request('/session',{capabilities:{alwaysMatch:{browserName:'webview2',pageLoadStrategy:'eager','ms:edgeOptions':{binary:resolve(process.env.GIT_UI_E2E_APP??'src-tauri/target/debug/git-ui.exe')}}}});
 session=created.sessionId;
 await click(xpath('smoke-project'));await contains('Initial commit');
 await click(xpath('Changes'));
 await click('//*[@data-testid="stage-file.txt"]/*[last()]');
 await until(()=>git(repo,'diff','--cached','--name-only')==='file.txt','staging wrote real index');
 const message=await element('textarea','css selector');await command(`/element/${message}/value`,{text:'UI smoke commit'});
 await click(xpath('Create commit'));
 await until(()=>git(repo,'log','-1','--format=%s')==='UI smoke commit','commit created');
 await screenshot('commit');
 await writeFile(join(repo,'file.txt'),'discard me\n');
 await command('/execute/sync',{script:'window.dispatchEvent(new Event("focus")); return true;',args:[]});
 await click(xpath('Changes'));await click(xpath('Discard changes…'));
 await contains('Discard file changes');
 await click('//label[contains(.,"I confirm")]/div');
 await click('//button[normalize-space(.)="Discard changes"]');
 await contains('Changes discarded');
 assert.equal(await readFile(join(repo,'file.txt'),'utf8'),'changed\n');assert.ok(git(repo,'stash','list'));
 await screenshot('discard');await click(xpath('Open backup in Stash'));await contains('Stash');
 // A separate project checks that selected files and history do not leak across projects.
 await click('//button[@aria-haspopup="dialog" and contains(@aria-label,"smoke-project")]');
 await click(xpath('history-project'));await contains('Initial commit');
 assert.ok(!String(await command('/source')).includes('UI smoke commit'));
 await screenshot('project-switch');
 await runRiskScenarios({command,element,click,contains,screenshot,until,git,repo,history:second,switchProject,refresh},fixtures);
 console.log('Native UI smoke passed: staging, commit, external refresh, discard backup, Stash, project switch.');
}catch(error){console.error('Native UI failure:',error);if(session){await screenshot('failure').catch(()=>{});await writeFile(join(artifacts,'failure.xml'),String(await command('/source').catch(()=>'')));}throw error;}
finally{
 if(session)await command('',undefined,'DELETE').catch(()=>{});
 driver.kill();await writeFile(join(artifacts,'driver.log'),logs);
 // Allow the WebView to release files before cleaning the isolated profile.
 await delay(500);await rm(settings,{recursive:true,force:true,maxRetries:5,retryDelay:300});await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:300});
}
