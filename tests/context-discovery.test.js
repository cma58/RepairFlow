'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {contextDiscovery}=require('../lib/context-discovery');
const cookie='__Secure-neon-auth.session_token=synthetic-test';
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(value){this.body=value;return this}}}
const env={REPAIRFLOW_DYNAMIC_CONTEXT_ENABLED:'true',REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:'postgres://query-spy-not-a-database'};
test('context list requires verified session and fails closed when disabled',async()=>{const denied=response();await contextDiscovery({method:'GET',headers:{}},denied,{env});assert.equal(denied.code,401);const off=response();await contextDiscovery({method:'GET',headers:{cookie}},off,{env:{...env,REPAIRFLOW_DYNAMIC_CONTEXT_ENABLED:'false'},authenticate:async()=>({subject:'subject'})});assert.deepEqual(off.body,{enabled:false,contexts:[]})});
test('discovery binds only verified subject and restricted runtime role',async()=>{const calls=[],row={organization_id:'11111111-1111-4111-8111-111111111111',organization_name:'Synthetic',branch_id:'22222222-2222-4222-8222-222222222222',branch_name:'Branch',base_role:'manager'};
 const db={async query(sql,params){calls.push({sql,params});if(sql.startsWith('SELECT current_user'))return {rows:[{name:'rf_runtime_login',bypass:false}]};if(sql.includes('rf_available_contexts'))return {rows:[row]};return {rows:[]}},release(){}};
 const res=response();await contextDiscovery({method:'GET',headers:{cookie,'x-repairflow-context':'forged'}},res,{env,authenticate:async()=>({subject:'verified-subject'}),createPool:()=>({connect:async()=>db,end:async()=>{}})});
 assert.deepEqual(res.body,{enabled:true,contexts:[row]});assert.deepEqual(calls.find(x=>x.sql.includes("set_config('app.subject'")).params,['verified-subject']);assert.ok(calls.some(x=>x.sql==='COMMIT'));assert.equal(res.headers['Cache-Control'],'no-store, private')});
