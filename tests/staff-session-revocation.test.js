'use strict';
// Regression test for P0 recovery finding F1: /api/auth/me must apply app-level
// session revocation (rf_session_denials) exactly like /api/workspace.
const test=require('node:test');const assert=require('node:assert/strict');
const staffSessionHandler=require('../api/staff-session');
const org='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222';
const identity={subject:'neon-subject-1',sessionId:'33333333-3333-4333-8333-333333333333',createdAt:new Date().toISOString()};
const env={REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:'test',REPAIRFLOW_ORGANIZATION_ID:org,REPAIRFLOW_BRANCH_ID:branch};
test('F1: /api/auth/me refuses an app-revoked cookie session instead of reporting the staff role',async()=>{
 const calls=[];const client={async query(sql,params){calls.push(sql);
  if(sql.startsWith('SELECT current_user'))return {rows:[{name:'rf_runtime_login',bypass:false}]};
  if(sql.includes('rf_session_denials'))return {rows:[{'?column?':1}]};
  if(sql.startsWith('SELECT s.id'))return {rows:[{id:'44444444-4444-4444-8444-444444444441',organization_id:org,branch_id:branch,role:'manager'}]};
  return {rows:[]}},release(){}};
 let status,body;const res={setHeader(){},status(n){status=n;return this},json(x){body=x;return this}};
 await staffSessionHandler({method:'GET',headers:{cookie:'__Secure-neon-auth.session_token=synthetic'}},res,{env,authenticate:async()=>identity,createPool:()=>({connect:async()=>client,end:async()=>{}})});
 assert.equal(status,403);assert.equal(body.role,undefined);
 assert.equal(calls.some(s=>s.startsWith('SELECT s.id')),false,'staff role is never resolved for a revoked session');
 assert.ok(calls.includes('ROLLBACK'));
});
