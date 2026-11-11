import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const base=(process.env.MATRIX_BRIDGE_URL || 'http://127.0.0.1:47615').replace(/\/$/,'');
const uri=new URL(base);if(uri.protocol!=='http:' || uri.hostname!=='127.0.0.1' || uri.username || uri.password || uri.pathname!=='/' || uri.search || uri.hash) throw Error('Matrix Bridge MCP requires a local loopback console URL');
const PANEL_URI='ui://matrix-bridge/console.html';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const uiOnly={ui:{visibility:['app']}};
function panelHtml() {
 const dir=join(root,'engine','console');
 let html=readFileSync(join(dir,'index.html'),'utf8');const css=readFileSync(join(dir,'styles.css'),'utf8');
 const connector=readFileSync(join(root,'mcp','assets','mcp-app-connector.js'),'utf8');const adapter=readFileSync(join(root,'mcp','panel-adapter.js'),'utf8');
 let app=readFileSync(join(dir,'app.js'),'utf8');
 app=app.replace(/async function api\(path,options\)\{[^\n]+\}/,adapter);
 app=app.replaceAll('!confirm(', '!await confirmAction(');
 html=html.replace('<link rel="stylesheet" href="/styles.css">',()=>`<style>${css}\n.confirm-overlay{position:fixed;inset:0;background:#0008;display:grid;place-items:center;z-index:100}.confirm-dialog{background:Canvas;color:CanvasText;max-width:28rem;padding:1.5rem;border-radius:12px}.confirm-dialog button{margin-right:.5rem}@media(max-width:500px){header{flex-wrap:wrap;gap:.5rem}header,nav,main{padding:12px}section{padding:14px}}</style>`);
 return html.replace('<script type="module" src="/app.js"></script>',()=>`<script>${connector}</script><script type="module">${app}</script>`);
}
const tools=[
 {name:'matrix_bridge_open',title:'Matrix Bridge 管理台',description:'在 Claude 中打开 Matrix Bridge 管理面板。',inputSchema:{type:'object',properties:{},additionalProperties:false},_meta:{ui:{resourceUri:PANEL_URI},'openai/ui':{entrypoints:[{type:'global'},{type:'thread'}]}}},
  {name:'matrix_bridge_projects',description:'获取项目目录列表。',inputSchema:{type:'object',properties:{}},_meta:uiOnly},
 {name:'matrix_bridge_clear_logs',description:'清空运行状态事件日志。',inputSchema:{type:'object',properties:{}},_meta:uiOnly},
 {name:'matrix_bridge_logs',description:'查看运行状态事件。',inputSchema:{type:'object',properties:{}},_meta:uiOnly},
 {name:'matrix_bridge_connection',description:'暂停或恢复同步。',inputSchema:{type:'object',required:['paused'],properties:{paused:{type:'boolean'}}},_meta:uiOnly},
 {name:'matrix_bridge_auth',description:'通过面板验证账号，凭证仅用于本机守护进程，不写入插件配置。',inputSchema:{type:'object',properties:{access_token:{type:'string'},username:{type:'string'},password:{type:'string'}}},_meta:uiOnly},
 {name:'matrix_bridge_logout',description:'清除进程内账号凭证并暂停同步。',inputSchema:{type:'object',properties:{}},_meta:uiOnly},
 {name:'matrix_bridge_defaults',description:'设置默认模型和思考深度。',inputSchema:{type:'object',required:['model','effort'],properties:{model:{type:'string'},effort:{type:'string'}}},_meta:uiOnly},
 {name:'matrix_bridge_migration',description:'选择旧房间会话的迁移候选。',inputSchema:{type:'object',required:['id','thread_id'],properties:{id:{type:'string'},thread_id:{type:'string'}}},_meta:uiOnly},
 {name:'matrix_bridge_reconcile',description:'人工核对未知结果后继续房间队列。',inputSchema:{type:'object',required:['id','event_id'],properties:{id:{type:'string'},event_id:{type:'string'}}},_meta:uiOnly},
 {name:'matrix_bridge_status',description:'查看 Matrix Bridge 运行状态。',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'matrix_bridge_rooms',description:'查看房间、工作区、策略与模型。',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'matrix_bridge_config',description:'查看不含凭证的安全和运行配置。',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'matrix_bridge_models',description:'获取 Claude 可用模型和默认设置。',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'matrix_bridge_browse',description:'浏览工作区目录。',inputSchema:{type:'object',properties:{path:{type:'string'}}}},
 {name:'matrix_bridge_search',description:'在默认项目目录下搜索目录。',inputSchema:{type:'object',required:['query'],properties:{query:{type:'string'}}}},
 {name:'matrix_bridge_update_room',description:'修改已有房间的工作区、回复策略、模型或思考深度；工作区变化会重置房间会话。',inputSchema:{type:'object',required:['id'],properties:{id:{type:'string'},workspace:{type:'string'},policy:{type:'string',enum:['default','mention','all','mute']},model:{type:'string'},effort:{type:'string'}}}},
 {name:'matrix_bridge_update_config',description:'修改安全配置；不能读取或设置令牌。',inputSchema:{type:'object',properties:{admins:{type:'array',items:{type:'string'}},allowed_senders:{type:'array',items:{type:'string'}},invite_policy:{type:'string'},invite_allowlist:{type:'array',items:{type:'string'}},message_policy:{type:'string'},message_allowlist:{type:'array',items:{type:'string'}},message_blocklist:{type:'array',items:{type:'string'}},federated_room_guard:{type:'boolean'},isolate_unbound_rooms:{type:'boolean'},admin_only_workspace:{type:'boolean'},redact_sensitive:{type:'boolean'},rate_limit_enabled:{type:'boolean'},auto_join:{type:'boolean'},group_reply_all:{type:'boolean'},default_policy:{type:'string',enum:['mention','all','mute']},cwd:{type:'string'}}}}
];
async function call(name,args){const get={matrix_bridge_status:'/api/status',matrix_bridge_rooms:'/api/rooms',matrix_bridge_config:'/api/config',matrix_bridge_models:'/api/models',matrix_bridge_projects:'/api/projects',matrix_bridge_logs:'/api/logs',matrix_bridge_browse:'/api/browse?path='+encodeURIComponent(args.path||''),matrix_bridge_search:'/api/search?q='+encodeURIComponent(args.query||'')};const post={matrix_bridge_update_room:'/api/room',matrix_bridge_update_config:'/api/config',matrix_bridge_connection:'/api/connection',matrix_bridge_logout:'/api/logout',matrix_bridge_auth:'/api/auth',matrix_bridge_defaults:'/api/defaults',matrix_bridge_migration:'/api/migration',matrix_bridge_reconcile:'/api/reconcile',matrix_bridge_clear_logs:'/api/logs/clear'};const path=get[name]||post[name];if(!path)throw Error('Unknown tool');const response=await fetch(base+path,post[name]?{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)}:{signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok)throw Error(result.error || `HTTP ${response.status}`);return result;}
const send=obj=>process.stdout.write(JSON.stringify(obj)+'\n');
createInterface({input:process.stdin}).on('line',async line=>{let msg;try{msg=JSON.parse(line);}catch{return;}if(msg.id===undefined)return;let result;
 if(msg.method==='initialize')result={protocolVersion:msg.params?.protocolVersion || '2025-03-26',capabilities:{tools:{},resources:{}},serverInfo:{name:'codex-matrix-bridge',version:'0.3.0'}};
 else if(msg.method==='tools/list')result={tools};
 else if(msg.method==='resources/list')result={resources:[{uri:PANEL_URI,name:'Matrix Bridge 管理台',mimeType:'text/html;profile=mcp-app'}]};
 else if(msg.method==='resources/read'){if(msg.params?.uri!==PANEL_URI){send({jsonrpc:'2.0',id:msg.id,error:{code:-32002,message:'Unknown resource'}});return;}result={contents:[{uri:PANEL_URI,mimeType:'text/html;profile=mcp-app',text:panelHtml()}]};}
 else if(msg.method==='tools/call' && msg.params?.name==='matrix_bridge_open') result={content:[{type:'text',text:'Matrix Bridge 管理台'}]};
 else if(msg.method==='tools/call'){try{result={content:[{type:'text',text:JSON.stringify(await call(msg.params?.name,msg.params?.arguments||{}))}]};}catch(e){result={isError:true,content:[{type:'text',text:`Matrix Bridge: ${e.message}`}]};}}
 else {send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});return;}
 send({jsonrpc:'2.0',id:msg.id,result});});
