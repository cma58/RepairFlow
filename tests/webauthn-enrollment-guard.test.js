'use strict';
// Regression tests for F2 (enrollment step-up), F3 (duplicate credential) and the
// phase-2 enrollment model (pending until bootstrap/admin approval). Unit level with a
// query spy; proven against real PostgreSQL and real Chrome in tests/integration + e2e.
const test=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {begin,finish,fingerprint,MAX_PENDING_CREDENTIALS}=require('../lib/webauthn-step-up');
const org='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222';
const identity={subject:'neon-subject-1',sessionId:'33333333-3333-4333-8333-333333333333',createdAt:new Date().toISOString()};
const env={REPAIRFLOW_APP_ORIGIN:'https://preview.example.org',REPAIRFLOW_WEBAUTHN_RP_ID:'preview.example.org',REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:'test',REPAIRFLOW_ORGANIZATION_ID:org,REPAIRFLOW_BRANCH_ID:branch};
const CID='44444444-4444-4444-8444-444444444444',challenge='A'.repeat(43);
function db({approved=false,stepUp=false,pending=0,duplicate=false}={}){
 const state={calls:[],challengeUsed:false,audits:[],inserted:0,approved,stepUp,pending};
 return {state,async query(sql,p=[]){state.calls.push(sql);
  if(sql.includes('rf_session_denials'))return {rows:[]};
  if(sql.includes('count(*)::int')&&sql.includes('FROM rf_webauthn_challenges'))return {rows:[{n:0}]};
  if(sql.includes('count(*)::int')&&sql.includes('FROM rf_webauthn_credentials'))return {rows:[{n:state.pending}]};
  if(sql.includes('FROM rf_webauthn_approvals a JOIN'))return {rows:state.approved?[{}]:[]};
  if(sql.includes('FROM rf_webauthn_grants g'))return {rows:state.stepUp&&p[3]==='credential.manage'?[{}]:[]};
  if(sql.startsWith('SELECT credential_id,transports'))return {rows:[]};
  if(sql.startsWith('INSERT INTO rf_webauthn_challenges'))return {rows:[{id:CID}]};
  if(sql.startsWith('UPDATE rf_webauthn_challenges')){if(state.challengeUsed)return {rows:[]};state.challengeUsed=true;return {rows:[{challenge_hash:crypto.createHash('sha256').update(challenge).digest('hex')}]}}
  if(sql.startsWith('INSERT INTO rf_webauthn_credentials')){if(duplicate)throw Object.assign(Error('duplicate key'),{code:'23505',severity:'ERROR'});state.inserted++;return {rows:[]}}
  if(sql.startsWith('INSERT INTO rf_security_events')){state.audits.push(JSON.parse(p[4]));return {rows:[]}}
  return {rows:[]};
 }};
}
const web={async generateRegistrationOptions(o){web.lastOptions=o;return {challenge}},async generateAuthenticationOptions(){return {challenge}},
 async verifyRegistrationResponse(){return {verified:true,registrationInfo:{credential:{id:'credential-id-12345',publicKey:new Uint8Array(65),counter:0,transports:['internal']},credentialDeviceType:'multiDevice',credentialBackedUp:true,userVerified:true,aaguid:'00000000-0000-0000-0000-000000000000',fmt:'none'}}}};
const response={id:'credential-id-12345',response:{clientDataJSON:Buffer.from(JSON.stringify({challenge,type:'webauthn.create'})).toString('base64url')}};

test('F2: with an APPROVED key in this tenant, adding a key without step-up (credential.manage) is refused before a challenge exists',async()=>{
 const d=db({approved:true});
 await assert.rejects(begin(d,identity,org,'registration',env,web),e=>e.code==='STEP_UP_REQUIRED');
 assert.equal(d.state.calls.some(s=>s.startsWith('INSERT INTO rf_webauthn_challenges')),false);
});
test('F2: after step-up with the approved key the new key is approved atomically via the DB (consumes the grant)',async()=>{
 const d=db({approved:true,stepUp:true});
 const start=await begin(d,identity,org,'registration',env,web);
 const r=await finish(d,identity,org,'registration',{challengeId:start.challengeId,response},env,web);
 assert.deepEqual([r.verified,r.state,r.synced],[true,'active',true]);
 assert.ok(d.state.calls.includes('SELECT public.rf_approve_own_credential_by_step_up($1)'));
 assert.ok(d.state.calls.some(s=>s.includes('pg_advisory_xact_lock')),'enrollment is serialized per subject');
});
test('first key (no approved key): stored as PENDING, never self-approved',async()=>{
 const d=db();const start=await begin(d,identity,org,'registration',env,web);
 const r=await finish(d,identity,org,'registration',{challengeId:start.challengeId,response},env,web);
 assert.deepEqual([r.verified,r.state,r.independentFactor],[true,'pending',false]);
 assert.equal(r.fingerprint,fingerprint('credential-id-12345'));
 assert.equal(d.state.calls.some(s=>s.includes('rf_approve_own_credential_by_step_up')),false);
 assert.equal(d.state.audits.at(-1).approvalRequired,true);
});
test('an attacker-enrolled PENDING key cannot lock out the owner: owner may still enroll (pending) without that key',async()=>{
 const d=db({pending:1});const start=await begin(d,identity,org,'registration',env,web);
 assert.equal((await finish(d,identity,org,'registration',{challengeId:start.challengeId,response},env,web)).state,'pending');
});
test('pending keys are capped per subject (enrollment spam)',async()=>{
 await assert.rejects(begin(db({pending:MAX_PENDING_CREDENTIALS}),identity,org,'registration',env,web),e=>e.code==='TOO_MANY_PENDING');
});
test('race: a key approved between begin and finish forces step-up at finish and stores nothing',async()=>{
 const d=db();const start=await begin(d,identity,org,'registration',env,web);d.state.approved=true;
 assert.deepEqual(await finish(d,identity,org,'registration',{challengeId:start.challengeId,response},env,web),{verified:false});
 assert.equal(d.state.inserted,0);assert.deepEqual(d.state.audits.at(-1),{ceremony:'registration',reason:'verification'});
});
test('option A registration options: platform passkeys allowed (no attachment restriction), UV required, no attestation prompt',async()=>{
 await begin(db(),identity,org,'registration',env,web);
 assert.equal(web.lastOptions.authenticatorSelection.authenticatorAttachment,undefined);
 assert.equal(web.lastOptions.authenticatorSelection.userVerification,'required');assert.equal(web.lastOptions.attestationType,'none');
});
test('F3: duplicate credential ID is a normal rejection; the consumed challenge is kept (savepoint, no rollback)',async()=>{
 const d=db({duplicate:true});const start=await begin(d,identity,org,'registration',env,web);
 assert.deepEqual(await finish(d,identity,org,'registration',{challengeId:start.challengeId,response},env,web),{verified:false});
 assert.ok(d.state.calls.includes('ROLLBACK TO SAVEPOINT rf_webauthn_credential_insert'));
 assert.equal(d.state.calls.includes('ROLLBACK'),false);
 await assert.rejects(finish(d,identity,org,'registration',{challengeId:start.challengeId,response},env,web),/INVALID_CHALLENGE/);
});
test('library verification errors that carry their own code remain audited rejections, not 503',async()=>{
 const d=db();const start=await begin(d,identity,org,'registration',env,web);
 const failing={...web,async verifyRegistrationResponse(){throw Object.assign(Error('Unexpected RP ID'),{code:'UNEXPECTED_RP_ID'})}};
 assert.deepEqual(await finish(d,identity,org,'registration',{challengeId:start.challengeId,response},env,failing),{verified:false});
});
test('registration without user verification is rejected even if the library reports verified',async()=>{
 const d=db();const start=await begin(d,identity,org,'registration',env,web);
 const noUV={...web,async verifyRegistrationResponse(){const r=await web.verifyRegistrationResponse();r.registrationInfo.userVerified=false;return r}};
 assert.deepEqual(await finish(d,identity,org,'registration',{challengeId:start.challengeId,response},env,noUV),{verified:false});
 assert.equal(d.state.inserted,0);
});
