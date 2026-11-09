'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {memberInvitations,hashToken}=require('../lib/member-invitations');const {pendingInvitation}=require('../lib/login-invitations');
const org='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',actor='44444444-4444-4444-8444-444444444444';
const env={REPAIRFLOW_APP_ORIGIN:'https://preview.example.org',REPAIRFLOW_ORGANIZATION_ID:org,REPAIRFLOW_BRANCH_ID:branch,REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:'test'};
const identity={subject:'neon-subject-1',sessionId:session,createdAt:new Date().toISOString()};
const token='A'.repeat(43);
function res(){return {code:0,setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}}}
const headers={origin:env.REPAIRFLOW_APP_ORIGIN,'content-type':'application/json',cookie:'better-auth.session_token=abc'};
function pool(db){return {connect:async()=>db,end:async()=>{}}}
test('invitation issuance is blocked without independent factor, even for the owner',async()=>{
 const calls=[];const db={async query(sql,p){calls.push(sql);if(sql.startsWith('SELECT current_user'))return {rows:[{name:'rf_runtime_login',bypass:false}]};
 if(sql.includes('FROM rf_staff s'))return {rows:[{id:actor,organization_id:org,branch_id:branch,role:'owner'}]};return {rows:[]}},release(){}};
 const req={method:'POST',headers,body:{action:'issue',branchId:branch,email:'synthetic@example.test',role:'technician'}};
 const r=res();await memberInvitations(req,r,{env,authenticate:async()=>identity,createPool:()=>pool(db)});
 assert.equal(r.code,403);assert.equal(calls.some(q=>q.includes('rf_issue_member_invitation')),false);
});
test('recipient acceptance sends only a hash and current authenticated subject to database',async()=>{
 const calls=[];const db={async query(sql,p){calls.push({sql,p});if(sql.startsWith('SELECT current_user'))return {rows:[{name:'rf_runtime_login',bypass:false}]};
 if(sql.includes('rf_accept_member_invitation'))return {rows:[{organization_id:org,branch_id:branch}]};return {rows:[]}},release(){}};
 const r=res();await memberInvitations({method:'POST',headers,body:{action:'accept',token}},r,{env,authenticate:async()=>identity,createPool:()=>pool(db)});
 assert.equal(r.code,200);assert.equal(r.body.organizationId,org);
 const call=calls.find(x=>x.sql.includes('rf_accept_member_invitation'));assert.deepEqual(call.p,[hashToken(token)]);assert.equal(JSON.stringify(calls).includes(token),false);
});
test('expired, replayed or wrong-email invite SQL errors do not activate membership',async()=>{
 const db={async query(sql){if(sql.startsWith('SELECT current_user'))return {rows:[{name:'rf_runtime_login',bypass:false}]};
 if(sql.includes('rf_accept_member_invitation'))throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});return {rows:[]}},release(){}};
 const r=res();await memberInvitations({method:'POST',headers,body:{action:'accept',token}},r,{env,authenticate:async()=>identity,createPool:()=>pool(db)});
 assert.equal(r.code,403);
});
test('pending invitation permits login-link request but never conveys membership',async()=>{
 const db={async query(sql){if(sql.startsWith('SELECT current_user'))return {rows:[{name:'rf_runtime_login',bypass:false}]};return {rows:[{pending:true}]}},release(){}};
 assert.equal(await pendingInvitation('synthetic@example.test',env,{createPool:()=>pool(db)}),true);
 assert.equal(await pendingInvitation('bad address',env,{createPool:()=>pool(db)}),false);
});
