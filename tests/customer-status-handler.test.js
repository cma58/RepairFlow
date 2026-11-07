'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCustomerStatusHandler}=require('../lib/customer-status-handler');
const {generateAccessToken}=require('../lib/customer-status');
function invoke(handler,method='POST',body={token:generateAccessToken()},headers={'content-type':'application/json'}){
 const res={code:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.data=v;return this;}};
 return Promise.resolve(handler({method,body,headers},res)).then(()=>res);
}
test('method and media type rejected before database lookup',async()=>{
 const handler=createCustomerStatusHandler({repository:{findActiveAccessByDigest:async()=>{throw Error('called')}},limiter:async()=>true});
 assert.equal((await invoke(handler,'GET')).code,405);
 assert.equal((await invoke(handler,'POST',{},{})).code,415);
});
test('invalid payload rejected',async()=>{
 const handler=createCustomerStatusHandler({repository:{findActiveAccessByDigest:async()=>null},limiter:async()=>true});
 assert.equal((await invoke(handler,'POST',{token:'x',extra:'y'})).code,400);
 assert.equal((await invoke(handler,'POST',null)).code,400);
});
test('rate limit denies requests before DB access',async()=>{
 let called=false;
 const handler=createCustomerStatusHandler({repository:{findActiveAccessByDigest:async()=>{called=true}},limiter:async()=>false});
 const res=await invoke(handler);assert.equal(res.code,429);assert.equal(called,false);
});
test('limiter failure returns 503, not open',async()=>{
 const handler=createCustomerStatusHandler({repository:{findActiveAccessByDigest:async()=>null},limiter:async()=>{throw Error('down')}});
 assert.equal((await invoke(handler)).code,503);
});
test('public success excludes all private data',async()=>{
 const handler=createCustomerStatusHandler({repository:{findActiveAccessByDigest:async()=>({reference:'PHX-1',status:'Diagnose',updated_at:'2026-11-07T12:00:00Z',current_location:'Bij Amine',internal_notes:'SECRET'})},limiter:async()=>true});
 const res=await invoke(handler);assert.equal(res.code,200);
 assert.deepEqual(Object.keys(res.data),['reference','status','updatedAt','nextStep']);
 assert.doesNotMatch(JSON.stringify(res.data),/Amine|SECRET/);
 assert.equal(res.headers['Cache-Control'],'no-store, private');
});
test('unknown token and database failure are safe',async()=>{
 const empty=createCustomerStatusHandler({repository:{findActiveAccessByDigest:async()=>null},limiter:async()=>true});
 assert.equal((await invoke(empty)).code,404);
 const broken=createCustomerStatusHandler({repository:{findActiveAccessByDigest:async()=>{throw Error('DB secret')}},limiter:async()=>true});
 const res=await invoke(broken);assert.equal(res.code,503);assert.doesNotMatch(JSON.stringify(res.data),/DB secret/);
});
