#!/usr/bin/env node
import { createInterface } from 'node:readline';
const send = x => process.stdout.write(JSON.stringify(x)+'\n');
createInterface({input:process.stdin}).on('line', line => {
 const m=JSON.parse(line);
 if (m.method==='initialize') send({id:m.id,result:{}});
 else if (m.method==='thread/start' || m.method==='thread/resume') send({id:m.id,result:{thread:{id:m.params.threadId || 't1'}}});
 else if (m.method==='turn/start') {send({id:m.id,result:{turn:{id:'turn1'}}});send({id:99,method:'item/commandExecution/requestApproval',params:{command:'pwd'}});}
 else if (m.id===99) { const text=m.result.decision; send({method:'item/completed',params:{threadId:'t1',turnId:'turn1',item:{type:'agentMessage',text}}});send({method:'turn/completed',params:{threadId:'t1',turn:{id:'turn1',status:'completed'}}}); }
});
