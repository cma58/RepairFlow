'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/staff-session');
const org='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222';
const auth='https://ep-test.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth';
const env={NEON_AUTH_ISSUER:auth,NEON_AUTH_AUDIENCE:'repairflow',NEON_AUTH_JWKS_URL:auth+'/.well-known/jwks.json',REPAIRFLOW_NEON_AUTH_URL:auth,REPAIRFLOW_ORGANIZATION_ID:org,REPAIRFLOW_BRANCH_ID:branch,REPAIRFLOW_RUNTIME_DATABASE_URL:'postgres://restricted.invalid/db',REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login'};
async function invoke({role='rf_runtime_login',staff=true,dbFail=false,settings=env}={}){
 const calls=[];let status=200,body,closed=false,released=false;
 const client={query:async(sql,params)=>{calls.push({sql,params});if(sql.startsWith('SELECT current_user'))return {rows:[{name:role,bypass:role!=='rf_runtime_login'}]};if(sql.startsWith('SELECT set_config'))return {rows:[]};if(sql.startsWith('SELECT s.id')){if(dbFail)throw Error('network down');return {rows:staff?[{id:'44444444-4444-4444-8444-444444444441',organization_id:org,branch_id:branch,role:'owner'}]:[]};}return {rows:[]};},release:()=>{released=true}};
 const pool={connect:async()=>client,end:async()=>{closed=true}};
 const res={setHeader(){return this},status(n){status=n;return this},json(x){body=x;return this}};
 await handler({method:'GET',headers:{authorization:'Bearer test.token.sig'}},res,{env:settings,authenticate:async()=>({subject:'test-owner-phixar'}),createPool:()=>pool});
 return {status,body,calls,closed,released};
}
test('verified owner is resolved inside a transaction with local tenant context',async()=>{
 const r=await invoke();assert.equal(r.status,200);assert.equal(r.body.role,'owner');
 assert.equal(r.calls[0].sql,'BEGIN');assert.match(r.calls[1].sql,/current_user/);
 assert.deepEqual(r.calls[2].params,['test-owner-phixar',org,branch]);
 assert.equal(r.calls[3].params[0],'test-owner-phixar');assert.equal(r.calls[4].sql,'COMMIT');
 assert.equal(r.closed,true);assert.equal(r.released,true);
});
test('owner database connection is rejected before staff lookup',async()=>{
 const r=await invoke({role:'neondb_owner'});assert.equal(r.status,503);assert.equal(r.calls.some(x=>x.sql.startsWith('SELECT s.id')),false);assert.equal(r.calls.at(-1).sql,'ROLLBACK');
});
test('inactive or unknown staff and database failures roll back',async()=>{
 const denied=await invoke({staff:false});assert.equal(denied.status,403);assert.equal(denied.calls.at(-1).sql,'ROLLBACK');
 const failed=await invoke({dbFail:true});assert.equal(failed.status,503);assert.equal(failed.calls.at(-1).sql,'ROLLBACK');
});
test('missing restricted runtime configuration fails closed',async()=>{
 const r=await invoke({settings:{...env,REPAIRFLOW_RUNTIME_ROLE:'neondb_owner'}});assert.equal(r.status,503);assert.equal(r.calls.length,0);
});
test('a JWT issuer from another Neon branch is rejected before database access',async()=>{
 const other='https://ep-other.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth';
 const r=await invoke({settings:{...env,NEON_AUTH_ISSUER:other,NEON_AUTH_JWKS_URL:other+'/.well-known/jwks.json'}});
 assert.equal(r.status,503);assert.equal(r.calls.length,0);
});
