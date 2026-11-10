'use strict';
// Unit tests for lib/credential-management.js and the security dispatch boundary.
const test=require('node:test');const assert=require('node:assert/strict');
const {credentialManagement,normalizeCode,hashCode,newCode,displayCode,ACTIONS}=require('../lib/credential-management');
const org='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222';
const identity={subject:'neon-subject-1',sessionId:'33333333-3333-4333-8333-333333333333',createdAt:new Date().toISOString()};
const env={REPAIRFLOW_APP_ORIGIN:'https://preview.example.org',REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:'test',REPAIRFLOW_ORGANIZATION_ID:org,REPAIRFLOW_BRANCH_ID:branch};
function res(){return {code:0,headers:{},status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v},json(v){this.body=v;return this}}}
function deps(role='owner',onQuery=()=>null){const calls=[];return {calls,env,authenticate:async()=>identity,createPool:()=>({connect:async()=>({async query(sql,p){calls.push({sql,p});
 if(sql.startsWith('SELECT current_user'))return {rows:[{name:'rf_runtime_login',bypass:false}]};
 if(sql.includes('rf_session_denials'))return {rows:[]};
 if(sql.includes('FROM rf_staff s'))return {rows:[{id:'44444444-4444-4444-8444-444444444441',organization_id:org,branch_id:branch,role}]};
 return onQuery(sql,p)||{rows:[]}},release(){}}),end:async()=>{}})}}
const req=body=>({method:'POST',headers:{origin:env.REPAIRFLOW_APP_ORIGIN,'content-type':'application/json',cookie:'__Secure-neon-auth.session_token=x'},body});

test('bootstrap codes: 26 Crockford base32 symbols (130 bits), hashed, display grouping round-trips',()=>{
 const seen=new Set();for(let i=0;i<200;i++){const c=newCode();assert.match(c,/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);seen.add(c)}assert.equal(seen.size,200);
 const c=newCode();assert.equal(normalizeCode(displayCode(c).toLowerCase()),c);assert.match(hashCode(c),/^[0-9a-f]{64}$/);
 for(const bad of [null,'','I'.repeat(26),'O'.repeat(26),'A'.repeat(25),'A'.repeat(27),'A'.repeat(70),{}])assert.equal(normalizeCode(bad),null,String(bad));
});
test('invalid input never reaches the database functions',async()=>{
 for(const body of [{action:'redeemBootstrap',code:'abc'},{action:'revokeCredential',fingerprint:'XYZ',reason:'ok reason'},{action:'blockCredential',fingerprint:'ABCD-1234',reason:'short'},
  {action:'approveCredential',targetStaffId:'nope',fingerprint:'ABCD-1234'},{action:'setSecurityPolicy',allowSyncedPasskeys:'yes'}]){
  const d=deps(),r=res();await credentialManagement(req(body),r,d);
  assert.equal(r.code,400,JSON.stringify(body));assert.equal(d.calls.some(c=>/public\.rf_(redeem|revoke|block|approve|set)/.test(c.sql)),false);
 }
});
test('owner-only actions are refused for managers before any security function runs',async()=>{
 for(const action of ['approveCredential','revokeMemberCredential','setSecurityPolicy']){
  const d=deps('manager'),r=res();await credentialManagement(req({action,targetStaffId:'44444444-4444-4444-8444-444444444442',fingerprint:'ABCD-1234',reason:'reden van tien tekens',allowSyncedPasskeys:true}),r,d);
  assert.equal(r.code,403,action);assert.equal(d.calls.some(c=>c.sql.includes('public.rf_')),false);
 }
});
test('technicians and sales have no security management at all',async()=>{
 for(const role of ['technician','sales']){const r=res();await credentialManagement(req({action:'securityStatus'}),r,deps(role));assert.equal(r.code,403)}
});
test('database refusals map to precise errors; a rejected bootstrap code is committed (attempt counter) and reported 403',async()=>{
 let r=res();let d=deps('owner',sql=>{if(sql.includes('rf_redeem_mfa_bootstrap'))return {rows:[{r:{activated:false}}]}});
 await credentialManagement(req({action:'redeemBootstrap',code:newCode()}),r,d);assert.deepEqual([r.code,r.body],[403,{error:'bootstrap_rejected'}]);
 assert.ok(d.calls.some(c=>c.sql==='COMMIT'));
 r=res();d=deps('owner',sql=>{if(sql.includes('rf_set_security_policy'))throw Object.assign(Error('STEP_UP_REQUIRED'),{code:'42501',severity:'ERROR'})});
 await credentialManagement(req({action:'setSecurityPolicy',allowSyncedPasskeys:false}),r,d);assert.deepEqual([r.code,r.body],[403,{error:'step_up_required'}]);
 r=res();d=deps('owner',sql=>{if(sql.includes('rf_block_own_credential'))throw Object.assign(Error('RECENT_LOGIN_REQUIRED'),{code:'42501',severity:'ERROR'})});
 await credentialManagement(req({action:'blockCredential',fingerprint:'abcd-1234',reason:'toestel verloren'}),r,d);assert.deepEqual([r.code,r.body],[403,{error:'recent_login_required'}]);
 assert.ok(d.calls.some(c=>c.sql==='ROLLBACK'));
});
test('foreign origin, missing cookie and non-JSON stop before authentication',async()=>{
 let r=res();await credentialManagement({...req({action:'securityStatus'}),headers:{...req({}).headers,origin:'https://evil.example'}},r,{env});assert.equal(r.code,403);
 r=res();await credentialManagement({...req({action:'securityStatus'}),headers:{origin:env.REPAIRFLOW_APP_ORIGIN,'content-type':'application/json'}},r,{env});assert.equal(r.code,401);
 r=res();await credentialManagement({...req({action:'securityStatus'}),headers:{...req({}).headers,'content-type':'text/plain'}},r,{env});assert.equal(r.code,415);
});
test('HTTP input cannot inject test dependencies into the Vercel entrypoint',async()=>{
 const handler=(await import('../api/security.js')).default;
 const forged=req({action:'securityStatus',env:{REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login'},authenticate:'x',createPool:'x'});
 forged.headers.origin='https://attacker.example';
 const saved=process.env.REPAIRFLOW_APP_ORIGIN;process.env.REPAIRFLOW_APP_ORIGIN='https://preview.example.org';
 try{const r=res();await handler(forged,r,{env:{REPAIRFLOW_APP_ORIGIN:'https://attacker.example'},authenticate:async()=>identity});assert.equal(r.code,403,'unmarked third argument and body fields are ignored')}
 finally{if(saved===undefined)delete process.env.REPAIRFLOW_APP_ORIGIN;else process.env.REPAIRFLOW_APP_ORIGIN=saved}
 assert.deepEqual([...ACTIONS].sort(),['approveCredential','blockCredential','redeemBootstrap','revokeCredential','revokeMemberCredential','securityStatus','setSecurityPolicy']);
});
