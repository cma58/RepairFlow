'use strict';
// Regression tests for P0 recovery findings F2 (enrollment step-up) and F3 (duplicate credential).
// Unit level with a query spy; the same behaviour is also proven against real
// PostgreSQL and a real browser in tests/integration and tests/e2e.
const test=require('node:test');const assert=require('node:assert/strict');
const {begin,finish}=require('../lib/webauthn-step-up');
const org='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222';
const identity={subject:'neon-subject-1',sessionId:'33333333-3333-4333-8333-333333333333',createdAt:new Date().toISOString()};
const env={REPAIRFLOW_APP_ORIGIN:'https://preview.example.org',REPAIRFLOW_WEBAUTHN_RP_ID:'preview.example.org',REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:'test',REPAIRFLOW_ORGANIZATION_ID:org,REPAIRFLOW_BRANCH_ID:branch};
const CID='44444444-4444-4444-8444-444444444444',challenge='A'.repeat(43);
function db({credentials=[],grant=false,duplicate=false}={}){
 const state={calls:[],challengeUsed:false,audits:[],inserted:0};
 return {state,async query(sql,p=[]){state.calls.push(sql);
  if(sql.includes('rf_session_denials'))return {rows:[]};
  if(sql.includes('count(*)::int'))return {rows:[{n:0}]};
  if(sql.startsWith('SELECT credential_id,transports'))return {rows:credentials};
  if(sql.includes('FROM rf_webauthn_grants g JOIN rf_webauthn_credentials'))return {rows:grant?[{'?column?':1}]:[]};
  if(sql.startsWith('SELECT 1 FROM rf_webauthn_credentials'))return {rows:credentials.length?[{}]:[]};
  if(sql.startsWith('INSERT INTO rf_webauthn_challenges'))return {rows:[{id:CID}]};
  if(sql.startsWith('UPDATE rf_webauthn_challenges')){if(state.challengeUsed)return {rows:[]};state.challengeUsed=true;return {rows:[{challenge_hash:require('node:crypto').createHash('sha256').update(challenge).digest('hex')}]}}
  if(sql.startsWith('INSERT INTO rf_webauthn_credentials')){if(duplicate)throw Object.assign(Error('duplicate key'),{code:'23505',severity:'ERROR'});state.inserted++;return {rows:[]}}
  if(sql.startsWith('INSERT INTO rf_security_events')){state.audits.push(JSON.parse(p[4]));return {rows:[]}}
  return {rows:[]};
 }};
}
const web={async generateRegistrationOptions(){return {challenge}},async generateAuthenticationOptions(){return {challenge}},
 async verifyRegistrationResponse(){return {verified:true,registrationInfo:{credential:{id:'credential-id-12345',publicKey:new Uint8Array(65),counter:0,transports:['usb']},credentialDeviceType:'singleDevice',credentialBackedUp:false}}}};
const response={id:'credential-id-12345',response:{clientDataJSON:Buffer.from(JSON.stringify({challenge,type:'webauthn.create'})).toString('base64url')}};
const existing=[{credential_id:'existing-credential-1',transports:['usb']}];

test('F2: registering an additional key without a live step-up grant in this session is refused before a challenge is issued',async()=>{
 const d=db({credentials:existing});
 await assert.rejects(begin(d,identity,org,'registration',env,web),e=>e.code==='STEP_UP_REQUIRED');
 assert.equal(d.state.calls.some(s=>s.startsWith('INSERT INTO rf_webauthn_challenges')),false);
});
test('F2: an additional key is accepted after step-up with an existing, non-revoked key in the same session',async()=>{
 const d=db({credentials:existing,grant:true});
 const start=await begin(d,identity,org,'registration',env,web);
 assert.deepEqual(await finish(d,identity,org,'registration',{challengeId:start.challengeId,response},env,web),{verified:true,independentFactor:false});
 assert.equal(d.state.inserted,1);
 assert.ok(d.state.calls.some(s=>s.includes('pg_advisory_xact_lock')),'enrollment is serialized per subject');
});
test('F2: race — a key that appeared between begin and finish forces step-up at finish and stores nothing',async()=>{
 const d=db();const start=await begin(d,identity,org,'registration',env,web);
 const raced=db({credentials:existing});raced.state.challengeUsed=false;
 const result=await finish({query:(sql,p)=>raced.query(sql,p)},identity,org,'registration',{challengeId:start.challengeId,response},env,web);
 assert.deepEqual(result,{verified:false});assert.equal(raced.state.inserted,0);
 assert.deepEqual(raced.state.audits.at(-1),{ceremony:'registration',reason:'verification'});
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
