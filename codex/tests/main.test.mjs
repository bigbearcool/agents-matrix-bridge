import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createServer} from 'node:net';import {spawn} from 'node:child_process';
test('standalone process serves console without credentials and exits cleanly',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'matrix-main-'));const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const cfg={homeserver:'https://example.invalid',user_id:'@bot:example.org',cwd:dir,admins:['@admin:example.org'],allowed_senders:['@admin:example.org'],direct_rooms:[],state_path:join(dir,'state.json'),console_port:port};const path=join(dir,'config.json');await writeFile(path,JSON.stringify(cfg));const env={...process.env};delete env.MATRIX_ACCESS_TOKEN;
 const child=spawn(process.execPath,['plugins/matrix-bridge/engine/main.mjs',path],{cwd:process.cwd(),env,stdio:'ignore'});
 try{let data;for(let i=0;i<60;i++){try{data=await (await fetch(`http://127.0.0.1:${port}/api/status`)).json();break}catch{await new Promise(r=>setTimeout(r,25));}}assert.ok(data);assert.equal(data.configured,false);assert.equal(data.running,true);}
 finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
 await assert.rejects(()=>access(cfg.state_path+'.lock'));
});
