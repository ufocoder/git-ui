// Read-only checks using the developer's existing SSH agent / credential helper.
// URLs and Git stderr are deliberately not printed: they can contain credentials.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
const urls=process.argv.slice(2);
if(!urls.length)throw new Error('Usage: node scripts/check-remotes.mjs <SSH URL> <HTTPS URL>');
for(const [index,url] of urls.entries()){
 const protocol=url.startsWith('https://')?'HTTPS':url.startsWith('ssh://')||/^[^/]+@[^:]+:/.test(url)?'SSH':null;
 if(!protocol)throw new Error('Only SSH and HTTPS remote URLs are accepted.');
 try{
  await run('git',['ls-remote','--',url],{timeout:120000,maxBuffer:16*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  console.log(`Remote ${index+1} (${protocol}): OK`);
 }catch(error){console.error(`Remote ${index+1} (${protocol}): FAILED${error.killed?' (timeout)':''}. Check credentials and connectivity in your Git setup.`);process.exitCode=1;}
}
