'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {revokeMemberSession}=require('../lib/management-session');
const org='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222';
const session='33333333-3333-4333-8333-333333333333',staffId='44444444-4444-4444-8444-444444444444';
const env={REPAIRFLOW_APP_ORIGIN:'https://preview.example.org',REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:'test',REPAIRFLOW_ORGANIZATION_ID:org,REPAIRFLOW_BRANCH_ID:branch};
const identity={subject:'subject-a',sessionId:session,createdAt:new Date().toISOString()};
function res(){return {code:0,setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}}}
const base={method:'POST',headers:{origin:env.REPAIRFLOW_APP_ORIGIN,'content-type':'application/json',cookie:'better-auth.session_token=abc'},body:{action:'revokeSession',targetStaffId:staffId,sessionId:null,reason:'Lost company device'}};
test('direct administrative API call cannot revoke without independent step-up',async()=>{
 const calls=[];const db={async query(sql,p){calls.push(sql);if(sql.startsWith('SELECT current_user'))return {rows:[{name:'rf_runtime_login',bypass:false}]};
 if(sql.includes('FROM rf_staff s'))return {rows:[{id:staffId,organization_id:org,branch_id:branch,role:'owner'}]};
 return {rows:[]}},release(){}};
 const r=res();await revokeMemberSession(base,r,{env,authenticate:async()=>identity,createPool:()=>({connect:async()=>db,end:async()=>{}})});
 assert.equal(r.code,403);assert.equal(r.body.error,'step_up_required');assert.equal(calls.some(q=>q.includes('rf_revoke_member_session')),false);
 assert.ok(calls.some(q=>q.includes("g.purpose=$4")),'precheck is bound to the session.revoke purpose');
 assert.ok(calls.some(q=>q.includes('rf_webauthn_grants')));
});
test('forged origin and malformed session ID never reach the database',async()=>{
 let r=res();await revokeMemberSession({...base,headers:{...base.headers,origin:'https://evil.example.org'}},r,{env});assert.equal(r.code,403);
 r=res();await revokeMemberSession({...base,body:{...base.body,sessionId:'not-a-session'}},r,{env});assert.equal(r.code,400);
});
