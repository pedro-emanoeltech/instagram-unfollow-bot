const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let listener,job,requests=0;const storage={};
const context={URLSearchParams,AbortSignal,Date,console,setTimeout,clearTimeout,
 document:{cookie:'csrftoken=synthetic-csrf; ds_user_id=123'},
 navigator:{locks:{request(name,options,fn){job=fn({});return job;}}},
 fetch:async()=>{requests++;return Response.json({status:'ok',form_data:{username:'other_example',user_id:'123'}});},
 chrome:{runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}},sendMessage:async()=>({})},storage:{local:{
 get:async keys=>typeof keys==='string'?{[keys]:storage[keys]}:Object.fromEntries(keys.map(k=>[k,storage[k]])),
 set:async value=>Object.assign(storage,value)
 }}}
};
vm.runInNewContext(fs.readFileSync('extension/worker.js','utf8'),context);
listener({kind:'ig-local-prepare',data:{source:'instagram-export',account:'expected_example',users:[],followers:0,following:0,protectedFollowers:[]}},{id:'test'},()=>{});
(async()=>{await job;assert.equal(requests,1,'wrong account must stop before list and mutation requests');assert.equal(storage.igLocalSnapshot,null);assert.equal(storage.igLocalPreparation.ready,false);assert.equal(storage.igLocalPreparation.events.at(-1).event,'stopped');console.log('OK: conta divergente impede preparação e mutações.');})().catch(e=>{console.error(e);process.exitCode=1;});
