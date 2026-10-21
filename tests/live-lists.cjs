const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function scan(mode){
 let listener,job,posts=0;const calls=[],storage={igLocalSnapshot:{old:true}};
 const context={URLSearchParams,AbortSignal,Date,console,setTimeout,clearTimeout,
 document:{cookie:'csrftoken=synthetic-csrf; ds_user_id=123'},
 navigator:{locks:{request(name,options,fn){job=fn({});return job;}}},
 fetch:async(path,options)=>{
   calls.push(path);if(options.method==='POST')posts++;
   if(path.includes('web_form_data'))return Response.json({status:'ok',form_data:{username:'account_example',user_id:'123',...(mode==='total'?{follower_count:50}:{})}});
   if(path.includes('/following/'))return Response.json({status:'ok',users:mode==='pipeline'?[{pk:'1',username:'mutual_new_name'}]:[{pk:'1',username:'mutual_old_name'},{pk:'2',username:'candidate_example'}]});
   if(mode==='http')return Response.json({status:'fail'},{status:429});
   return Response.json({status:'ok',users:[{pk:'1',username:'mutual_new_name'}],...(mode==='cursor'?{next_max_id:'repeat'}:{})});
 },
 chrome:{runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}},sendMessage:async()=>({})},storage:{local:{
 get:async keys=>typeof keys==='string'?{[keys]:storage[keys]}:Object.fromEntries(keys.map(k=>[k,storage[k]])),set:async value=>Object.assign(storage,value)
 }}}
 };
 vm.runInNewContext(fs.readFileSync('extension/worker.js','utf8'),context);
 listener(mode==='pipeline'?{kind:'ig-local-toggle',pageContext:{dtsg:'synthetic',lsd:'synthetic'}}:{kind:'ig-local-prepare'},{id:'test'},()=>{});await job;
 assert.equal(posts,0,'loading lists must not mutate account');
 if(mode==='pipeline'){
  assert.equal(storage.igLocalControl.status,'complete');
  assert.equal(storage.igLocalSnapshot.candidates.length,0);
  assert.equal(storage.igLocalState.account,'account_example');
 }else if(mode==='ok'){
  assert.equal(storage.igLocalPreparation.ready,true);
  assert.deepEqual(Array.from(storage.igLocalSnapshot.candidates),['candidate_example']);
  assert.equal(storage.igLocalSnapshot.account,'account_example');
  assert.equal(Object.keys(storage.igLocalSnapshot.followers).length,1);
  assert.equal(Object.keys(storage.igLocalSnapshot.following).length,2);
  assert.ok(storage.igLocalPreparation.events.some(e=>e.event==='compared'));
 }else{assert.equal(storage.igLocalPreparation.ready,false);assert.equal(storage.igLocalSnapshot,null,'stale snapshot must be invalidated');}
}
(async()=>{for(const mode of ['ok','pipeline','cursor','total','http'])await scan(mode);console.log('OK: listas atuais, comparação por ID, pipeline sem importação, zero mutações, cursor repetido, total divergente e HTTP 429.');})().catch(e=>{console.error(e);process.exitCode=1;});
