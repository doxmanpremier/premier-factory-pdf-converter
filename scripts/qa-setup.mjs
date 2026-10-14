import fs from 'node:fs';import {spawnSync} from 'node:child_process';import path from 'node:path';
const configPath='.sites-runtime/qa/wrangler.json';const config=JSON.parse(fs.readFileSync(configPath));config.vars.AUTH_PASSWORD_HASH=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('qa-password'))),x=>x.toString(16).padStart(2,'0')).join('');fs.writeFileSync(configPath,JSON.stringify(config,null,2));
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config',configPath,'--persist-to','.sites-runtime/qa/state','--file',path.join('drizzle',file),'--yes'],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
}
