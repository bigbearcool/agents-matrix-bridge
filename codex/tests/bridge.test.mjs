import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Bridge } from '../plugins/matrix-bridge/engine/bridge.mjs';

test('sender, mention, persistence and room session continuation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'matrix-test-')); const calls = []; const sent = [];
  const cfg = { homeserver:'https://example.org', user_id:'@bot:example.org', allowed_senders:['@a:example.org'], direct_rooms:[], cwd:dir, state_path:join(dir,'state.json') };
  const factory = () => ({ initialize:async()=>{}, close:()=>{}, turn:async x=>{ calls.push(x.threadId); await x.onThread('thread-1'); return {text:'answer',approval:false}; } });
  const b = new Bridge(cfg,'secret-test',{clientFactory:factory,fetchImpl:async (url,opt)=>{ sent.push(JSON.parse(opt.body)); return {ok:true,json:async()=>({})}; }}); await b.load();
  const ev = {type:'m.room.message',sender:'@a:example.org',event_id:'$1',content:{msgtype:'m.text',body:'hello','m.mentions':{user_ids:['@bot:example.org']}}};
  await b.processEvent('!room', {...ev,sender:'@other:example.org'}); await b.processEvent('!room', {...ev,content:{...ev.content,'m.mentions':{user_ids:[]}}}); assert.equal(calls.length,0);
  await b.processEvent('!room', ev); await b.processEvent('!room', ev); await b.processEvent('!room', {...ev,event_id:'$2'}); await b.queues.get('!room');
  assert.deepEqual(calls,[undefined,'thread-1']); assert.equal(sent.length,2); assert.equal(sent[0].body,'answer');
  const state = await readFile(cfg.state_path,'utf8'); assert.ok(!state.includes('secret-test'));
  const b2 = new Bridge(cfg,'secret-test',{clientFactory:factory,fetchImpl:async()=>({ok:true,json:async()=>({})})}); await b2.load(); await b2.processEvent('!room',ev); assert.equal(calls.length,2);
});
test('initial sync skips backlog and advances checkpoint', async () => {
 const dir = await mkdtemp(join(tmpdir(),'matrix-test-')); let invoked=0;
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['@a:example.org'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>{invoked++;},fetchImpl:async()=>({ok:true,json:async()=>({next_batch:'s1',rooms:{join:{'!r':{timeline:{events:[{type:'m.room.message',sender:'@a:example.org',event_id:'$x',content:{msgtype:'m.text',body:'old'}}]}}}}})})});
 await b.load(); await b.syncOnce(); assert.equal(invoked,0); assert.equal(b.state.next_batch,'s1');
});

test('approval requires an administrator in the originating room and resumes the turn', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-approval-')); const sent=[];
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],admins:['@admin:example.org'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json'),codex_cmd:join(process.cwd(),'tests/fixtures/fake-codex.mjs')};
 const b=new Bridge(cfg,'token',{fetchImpl:async (_url,opts)=>{ sent.push(JSON.parse(opts.body)); return {ok:true,json:async()=>({})}; }}); await b.load();
 const msg={type:'m.room.message',sender:'@user:example.org',event_id:'$1',content:{msgtype:'m.text',body:'do it'}}; await b.processEvent('!r',msg);
 for (let i=0;i<100 && !b.approvals.size;i++) await new Promise(r=>setTimeout(r,10));
 assert.equal(b.approvals.size,1); const id=[...b.approvals.keys()][0];
 const decision={...msg,event_id:'$2',content:{msgtype:'m.text',body:`/approve ${id}`}};
 await b.processEvent('!r',decision); assert.equal(b.approvals.size,1);
 await b.processEvent('!other',{...decision,sender:'@admin:example.org'}); assert.equal(b.approvals.size,1);
 await b.processEvent('!r',{...decision,sender:'@admin:example.org'}); await b.queues.get('!r');
 assert.equal(b.approvals.size,0); assert.equal(sent.at(-1).body,'accept');
});
test('encrypted room is not sent to Codex', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-encrypted-')); let calls=0;
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>{calls++;},fetchImpl:async()=>({ok:true,json:async()=>({next_batch:'n',rooms:{join:{'!r':{state:{events:[{type:'m.room.encryption'}]},timeline:{events:[]}}}}})})});
 await b.load(); await b.syncOnce(); await b.processEvent('!r',{event_id:'$1',type:'m.room.message',sender:'@a:example.org',content:{msgtype:'m.text',body:'test'}}); assert.equal(calls,0); assert.equal(b.state.rooms['!r'].encrypted,true);
});

test('unknown delivery outcome pauses subsequent messages without replay', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-unknown-')); let calls=0,sends=0;
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>({initialize:async()=>{},turn:async()=>{calls++;return {text:'answer'};},close:()=>{}}),fetchImpl:async()=>{sends++;throw new Error('connection lost');}}); await b.load();
 const ev={event_id:'$1',type:'m.room.message',sender:'@a:example.org',content:{msgtype:'m.text',body:'test'}};
 await b.processEvent('!r',ev); await b.queues.get('!r');
 await b.processEvent('!r',{...ev,event_id:'$2'});
 assert.equal(calls,1); assert.equal(sends,1); assert.equal(b.state.inbox[0].status,'replying'); assert.ok(b.blockedRooms.has('!r')); assert.equal(b.state.inbox[1].status,'queued');
});

test('two-member group is not a DM without a matching m.direct mapping', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-dm-')); let calls=0;
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],direct_rooms:[],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>{calls++;},fetchImpl:async url=>({ok:true,json:async()=>url.includes('account_data') ? {} : {joined:{'@bot:example.org':{},'@a:example.org':{}}}})});
 await b.load(); await b.processEvent('!group',{event_id:'$1',type:'m.room.message',sender:'@a:example.org',content:{msgtype:'m.text',body:'hello'}}); assert.equal(calls,0); assert.equal(b.queues.size,0);
});

test('auto join only acts on invitations addressed to this bot', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-invite-')); const requests=[];
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],direct_rooms:[],auto_join:true,cwd:dir,state_path:join(dir,'state.json')};
 const event=state_key=>({type:'m.room.member',state_key,content:{membership:'invite'}});
 const b=new Bridge(cfg,'token',{fetchImpl:async (url,opts)=>{requests.push({url,method:opts.method});return {ok:true,json:async()=>opts.method==='POST'?{}:{next_batch:'s',rooms:{invite:{'!yes':{invite_state:{events:[event('@bot:example.org')]}},'!no':{invite_state:{events:[event('@other:example.org')]}}}}}};}});
 await b.load(); await b.syncOnce(); const joins=requests.filter(r=>r.method==='POST'); assert.equal(joins.length,1); assert.ok(joins[0].url.endsWith('/!yes'));
});

test('session commands are queued, switch history, and protect directory changes', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-cmd-')); const sent=[]; const starts=[];
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],admins:['@admin:example.org'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>({initialize:async()=>{},close:()=>{},turn:async x=>{starts.push(x.threadId);await x.onThread(x.threadId||`t${starts.length}`);return {text:'ok'};}}),fetchImpl:async (_u,o)=>{sent.push(JSON.parse(o.body).body);return {ok:true,json:async()=>({})};}});await b.load();
 let n=0; async function msg(text,sender='@admin:example.org'){await b.processEvent('!r',{event_id:`$${++n}`,type:'m.room.message',sender,content:{msgtype:'m.text',body:text}});await b.queues.get('!r');}
 await msg('hello'); await msg('/new test'); await msg('new chat'); await msg('/switch s1'); await msg('resume'); await msg('/dir /tmp','@other:example.org');
 assert.deepEqual(starts,[undefined,'','t1']); assert.match(sent.at(-1),/只有管理员/); assert.equal(b.state.rooms['!r'].workspace,dir);
});

test('Matrix image downloads privately and is passed to Codex as localImage', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-media-')); let turn;
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>({initialize:async()=>{},close:()=>{},turn:async x=>{turn=x;return {text:'ok'};}}),fetchImpl:async (url,opts)=> url.includes('/media/download/') ? new Response(Buffer.from('test image')) : {ok:true,json:async()=>({})}}); await b.load();
 await b.processEvent('!r',{event_id:'$image',type:'m.room.message',sender:'@a:example.org',content:{msgtype:'m.image',body:'image.png',url:'mxc://example.org/id'}}); await b.queues.get('!r');
 assert.equal(turn.attachments[0].type,'localImage'); assert.equal(await readFile(turn.attachments[0].path,'utf8'),'test image');
});
test('encrypted and excessive attachments fail closed', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-media-')); const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],direct_rooms:[],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{fetchImpl:async()=>{throw new Error('must not download');}});
 await assert.rejects(()=>b.downloadAttachment({file:{},url:'mxc://example.org/id'}),/encrypted/);
 await assert.rejects(()=>b.downloadAttachment({url:'mxc://example.org/id',info:{size:51*1024*1024}}),/50 MiB/);
});

test('single instance lock rejects a second holder and releases cleanly', async () => {
 const {acquireLock}=await import('../plugins/matrix-bridge/engine/instance-lock.mjs'); const dir=await mkdtemp(join(tmpdir(),'matrix-lock-')); const path=join(dir,'state.json');
 const release=await acquireLock(path); await assert.rejects(()=>acquireLock(path),{code:'EEXIST'}); await release(); const again=await acquireLock(path); await again();
});

test('multi-question input only accepts originating sender or administrator and rejects secret prompts', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-input-')); const sent=[]; const replies=[];
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],admins:['@admin:example.org'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{fetchImpl:async (_u,o)=>{sent.push(JSON.parse(o.body).body);return {ok:true,json:async()=>({})};}});await b.load();
 const client={respondInput:(id,answers)=>replies.push({id,answers})}; const ev={sender:'@a:example.org',event_id:'$1'};
 await b.requestInput(client,'!r',ev,'',{id:5,params:{questions:[{id:'q1',question:'first?'},{id:'q2',question:'second?'}]}});
 const id=[...b.approvals.keys()][0]; let n=0; async function answer(user,text){await b.processEvent('!r',{event_id:`$a${++n}`,type:'m.room.message',sender:user,content:{msgtype:'m.text',body:`/answer ${id} ${text}`}});}
 await answer('@other:example.org','bad'); assert.equal(sent.length,1); await answer('@a:example.org','one'); await answer('@admin:example.org','two');
 assert.deepEqual(replies[0],{id:5,answers:{q1:{answers:['one']},q2:{answers:['two']}}});
 await b.requestInput(client,'!r',ev,'',{id:6,params:{questions:[{id:'secret',question:'secret?',isSecret:true}]}}); assert.deepEqual(replies[1],{id:6,answers:{}}); assert.equal(b.approvals.size,0);
});

test('sync continues while a Codex approval is pending, then resumes and replies', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-sync-')); const sent=[]; let sync=0;
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],admins:['@admin:example.org'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json'),codex_cmd:join(process.cwd(),'tests/fixtures/fake-codex.mjs')};
 const b=new Bridge(cfg,'token',{fetchImpl:async (url,opts)=>{
   if (opts.method==='PUT') {sent.push(JSON.parse(opts.body).body);return {ok:true,json:async()=>({})};}
   sync++; let events=[];
   if(sync===2) events=[{event_id:'$1',type:'m.room.message',sender:'@admin:example.org',content:{msgtype:'m.text',body:'run'}}];
   if(sync===3) { const id=[...b.approvals.keys()][0]; events=[{event_id:'$2',type:'m.room.message',sender:'@admin:example.org',content:{msgtype:'m.text',body:`/approve ${id}`}}]; }
   return {ok:true,json:async()=>({next_batch:`s${sync}`,rooms:{join:{'!r':{timeline:{events}}}}})};
 }}); await b.load(); await b.syncOnce(); await b.syncOnce();
 for(let i=0;i<100&&!b.approvals.size;i++) await new Promise(r=>setTimeout(r,10));
 assert.equal(b.approvals.size,1); await b.syncOnce(); await b.queues.get('!r');
 assert.match(sent[0],/请求审批/); assert.equal(sent.at(-1),'accept'); assert.equal(b.state.next_batch,'s3');
});

test('session commands do not trigger inside ordinary prose', async () => {
 const {handleCommand}=await import('../plugins/matrix-bridge/engine/commands.mjs'); const room={};
 assert.equal(await handleCommand({body:'请解释 /new 的用途',room,config:{cwd:'/tmp',user_id:'@bot:example.org',admins:[]},sender:'@a:example.org'}),null);
 assert.deepEqual(room,{});
});
test('each active session retains independent Matrix thread context', async () => {
 const {handleCommand}=await import('../plugins/matrix-bridge/engine/commands.mjs'); const config={cwd:'/tmp',user_id:'@bot:example.org',admins:['@a:example.org']};
 const room={thread_id:'main',thread_sessions:{'$root':'child'}}; const call=body=>handleCommand({body,room,config,sender:'@a:example.org'});
 await call('/new'); room.thread_sessions['$other']='child2'; await call('/switch s1'); assert.equal(room.thread_sessions['$root'],'child'); await call('/switch s2'); assert.equal(room.thread_sessions['$other'],'child2');
});

test('room policy changes delivery without letting unmentioned group commands run', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-policy-')); let calls=0; const sent=[];
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],admins:['@admin:example.org'],direct_rooms:[],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>({initialize:async()=>{},close:()=>{},turn:async()=>{calls++;return {text:'ok'}}}),fetchImpl:async (_u,o)=>o.method==='PUT'?(sent.push(JSON.parse(o.body).body),{ok:true,json:async()=>({})}):{ok:true,json:async()=>({})}});await b.load();
 const ev=(id,body,mentions=[])=>({event_id:id,type:'m.room.message',sender:'@admin:example.org',content:{msgtype:'m.text',body,'m.mentions':{user_ids:mentions}}});
 await b.processEvent('!r',ev('$1','@bot:example.org /policy all',['@bot:example.org']));await b.queues.get('!r');
 await b.processEvent('!r',ev('$2','hello'));await b.queues.get('!r');assert.equal(calls,1);
 await b.processEvent('!r',ev('$3','/policy mute'));assert.equal(b.state.rooms['!r'].policy,'all');
 await b.processEvent('!r',ev('$4','@bot:example.org /policy mute',['@bot:example.org']));await b.queues.get('!r');
 await b.processEvent('!r',ev('$5','@bot:example.org hello',['@bot:example.org']));assert.equal(calls,1);
 await b.processEvent('!r',ev('$6','@bot:example.org /policy mention',['@bot:example.org']));await b.queues.get('!r');assert.equal(b.state.rooms['!r'].policy,'mention');
});

test('workspace, model and effort commands affect subsequent Codex turns', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-settings-')); let invocation;
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],admins:['@admin:example.org'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>({initialize:async()=>{},close:()=>{},turn:async x=>{invocation=x;return {text:'ok'};}}),fetchImpl:async()=>({ok:true,json:async()=>({})})}); await b.load();
 let n=0;async function msg(text){await b.processEvent('!r',{event_id:`$${++n}`,type:'m.room.message',sender:'@admin:example.org',content:{msgtype:'m.text',body:text}}); await b.queues.get('!r');}
 await msg('/workspace bind /tmp');await msg('/model demo-model');await msg('/effort high');await msg('hello');
 assert.equal(invocation.cwd,'/tmp');assert.equal(invocation.model,'demo-model');assert.equal(invocation.effort,'high');
});

test('message and invitation policies, and outbound secret redaction', async () => {
 const {messageAllowed,inviteAllowed,redact}=await import('../plugins/matrix-bridge/engine/security.mjs');
 const cfg={user_id:'@bot:home.example',admins:['@admin:home.example'],message_policy:'allowlist',message_allowlist:['@*:trusted.example'],invite_policy:'local_server'};
 assert.equal(messageAllowed(cfg,'@user:trusted.example'),true);assert.equal(messageAllowed(cfg,'@user:other.example'),false);assert.equal(messageAllowed(cfg,'@admin:home.example'),true);
 assert.equal(inviteAllowed(cfg,'@user:home.example'),true);assert.equal(inviteAllowed(cfg,'@user:trusted.example'),false);
 assert.equal(redact('token-actual-value',true,'token-actual-value'),'[TOKEN_REDACTED]');
});

test('federation guard and admin-only workspace enforcement block ordinary execution', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-guard-')); let calls=0; let external=true;
 const cfg={homeserver:'https://home.example',user_id:'@bot:home.example',allowed_senders:['*'],admins:['@admin:home.example'],direct_rooms:[],group_reply_all:true,federated_room_guard:true,cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>({initialize:async()=>{},close:()=>{},turn:async()=>{calls++;return {text:'ok'};}}),fetchImpl:async (url,o)=>o.method==='PUT'?{ok:true,json:async()=>({})}:{ok:true,json:async()=>url.includes('joined_members')?{joined:{'@bot:home.example':{},[external?'@user:foreign.example':'@user:home.example']:{}}}:{} }});await b.load();
 const ev=id=>({event_id:id,type:'m.room.message',sender:'@user:home.example',content:{msgtype:'m.text',body:'hello'}});
 await b.processEvent('!room:home.example',ev('$1'));assert.equal(calls,0);
 external=false;cfg.admin_only_workspace=true;await b.processEvent('!room:home.example',ev('$2'));assert.equal(calls,0);
 cfg.admin_only_workspace=false;await b.processEvent('!room:home.example',ev('$3'));await b.queues.get('!room:home.example');assert.equal(calls,1);
});

test('admin can send a native Matrix file in the original thread', async () => {
 const {writeFile}=await import('node:fs/promises');const dir=await mkdtemp(join(tmpdir(),'matrix-sendfile-'));await writeFile(join(dir,'report.txt'),'report');const requests=[];
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],admins:['@admin:example.org'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{fetchImpl:async (url,o)=>{requests.push({url,method:o.method,body:o.body});return {ok:true,json:async()=>o.method==='POST'?{content_uri:'mxc://example.org/123'}:{event_id:'$sent'}}}});await b.load();
 await b.processEvent('!r',{event_id:'$1',type:'m.room.message',sender:'@admin:example.org',content:{msgtype:'m.text',body:'/sendfile report.txt','m.relates_to':{rel_type:'m.thread',event_id:'$root'}}});await b.queues.get('!r');
 assert.equal(requests.length,2);const message=JSON.parse(requests[1].body);assert.equal(message.msgtype,'m.file');assert.equal(message.url,'mxc://example.org/123');assert.equal(message['m.relates_to'].event_id,'$root');
});
test('assistant file marker is uploaded once and removed from text reply', async () => {
 const {writeFile}=await import('node:fs/promises');const dir=await mkdtemp(join(tmpdir(),'matrix-output-'));await writeFile(join(dir,'x.pdf'),'fake-pdf');const requests=[];
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>({initialize:async()=>{},close:()=>{},turn:async()=>({text:'已完成 [SEND_FILE: x.pdf]'})}),fetchImpl:async (url,o)=>{requests.push({url,method:o.method,body:o.body});return {ok:true,json:async()=>o.method==='POST'?{content_uri:'mxc://example.org/1'}:{event_id:'$sent'}}}});await b.load();
 await b.processEvent('!r',{event_id:'$1',type:'m.room.message',sender:'@user:example.org',content:{msgtype:'m.text',body:'make report'}});await b.queues.get('!r');
 assert.equal(requests.filter(r=>r.method==='POST').length,1); const texts=requests.filter(r=>r.method==='PUT').map(r=>JSON.parse(r.body));assert.equal(texts[0].msgtype,'m.file');assert.equal(texts[1].body,'已完成');
});

test('encrypted room can reach an explicitly configured Pantalaimon transport', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-proxy-'));let calls=0;
 const cfg={homeserver:'http://127.0.0.1:8009',matrix_transport:'pantalaimon',user_id:'@bot:example.org',allowed_senders:['*'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>({initialize:async()=>{},close:()=>{},turn:async()=>{calls++;return {text:'ok'}}}),fetchImpl:async()=>({ok:true,json:async()=>({})})});await b.load();b.state.rooms['!r']={encrypted:true};
 await b.processEvent('!r',{event_id:'$1',type:'m.room.message',sender:'@a:example.org',content:{msgtype:'m.text',body:'hello'}});await b.queues.get('!r');assert.equal(calls,1);
});

test('unbound room uses the configured separate working directory', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-sandbox-'));let cwd;const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json'),isolate_unbound_rooms:true};
 const b=new Bridge(cfg,'token',{clientFactory:()=>({initialize:async()=>{},close:()=>{},turn:async x=>{cwd=x.cwd;return {text:'ok'}}}),fetchImpl:async()=>({ok:true,json:async()=>({})})});await b.load();await b.processEvent('!r',{event_id:'$1',type:'m.room.message',sender:'@a:example.org',content:{msgtype:'m.text',body:'hello'}});await b.queues.get('!r');assert.equal(cwd,join(dir,'sandbox'));
});

test('reply to a bot event triggers group response without a new mention', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-reply-'));let calls=0;
 const cfg={homeserver:'https://example.org',user_id:'@bot:example.org',allowed_senders:['*'],direct_rooms:[],group_reply_all:true,cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>({initialize:async()=>{},close:()=>{},turn:async()=>{calls++;return {text:'ok'}}}),fetchImpl:async (_u,o)=>o.method==='PUT'?{ok:true,json:async()=>({event_id:'$bot'})}:{ok:true,json:async()=>({})}});await b.load();
 const msg={type:'m.room.message',sender:'@a:example.org',content:{msgtype:'m.text',body:'hello'}};await b.processEvent('!r',{...msg,event_id:'$1'});await b.queues.get('!r');cfg.group_reply_all=false;
 await b.processEvent('!r',{...msg,event_id:'$2',content:{...msg.content,'m.relates_to':{'m.in_reply_to':{event_id:'$bot'}}}});await b.queues.get('!r');assert.equal(calls,2);
});

test('image dimensions handle PNG, GIF, JPEG and truncated data', async () => {
 const {imageDimensions}=await import('../plugins/matrix-bridge/engine/media.mjs');const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(20,16);png.writeUInt32BE(10,20);assert.deepEqual(imageDimensions(png),{w:20,h:10});
 const gif=Buffer.from([71,73,70,56,57,97,20,0,10,0]);assert.deepEqual(imageDimensions(gif),{w:20,h:10});
 const jpeg=Buffer.from([255,216,255,192,0,7,8,0,10,0,20,255,217]);assert.deepEqual(imageDimensions(jpeg),{w:20,h:10});assert.deepEqual(imageDimensions(Buffer.from([255,216,255,192])),{});
});

test('Pantalaimon undecryptable placeholder is never dispatched to Codex', async () => {
 const dir=await mkdtemp(join(tmpdir(),'matrix-decrypt-'));let calls=0;const cfg={homeserver:'http://127.0.0.1:8009',matrix_transport:'pantalaimon',user_id:'@bot:example.org',allowed_senders:['*'],direct_rooms:['!r'],cwd:dir,state_path:join(dir,'state.json')};
 const b=new Bridge(cfg,'token',{clientFactory:()=>{calls++;},fetchImpl:async()=>({ok:true,json:async()=>({})})});await b.load();await b.processEvent('!r',{event_id:'$1',type:'m.room.message',sender:'@a:example.org',content:{msgtype:'m.text',body:'** Unable to decrypt: missing session key'}});assert.equal(calls,0);assert.equal(b.queues.size,0);assert.equal(b.activity.at(-1).kind,'warn');
});
