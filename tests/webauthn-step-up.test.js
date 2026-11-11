'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {begin,finish,relyingParty,requireManagementStepUp}=require('../lib/webauthn-step-up');
const {webauthnHandler}=require('../lib/webauthn-handler');
const org='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222';
const session='33333333-3333-4333-8333-333333333333',identity={subject:'neon-subject-1',sessionId:session,createdAt:new Date().toISOString()};
const env={REPAIRFLOW_APP_ORIGIN:'https://preview.example.org',REPAIRFLOW_WEBAUTHN_RP_ID:'preview.example.org',REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:'test',REPAIRFLOW_ORGANIZATION_ID:org,REPAIRFLOW_BRANCH_ID:branch};
const uuid='44444444-4444-4444-8444-444444444444';
function db(){const state={challenges:[],credentials:[],grants:[],audits:[],calls:[]};return {state,async query(sql,p=[]){state.calls.push({sql,p});
 if(sql.includes('rf_session_denials'))return {rows:[]};
 if(sql.includes('count(*)::int')&&sql.includes('FROM rf_webauthn_challenges'))return {rows:[{n:state.challenges.length}]};
 if(sql.includes('count(*)::int'))return {rows:[{n:0}]};
 if(sql.includes('rf_record_webauthn_assertion')){state.grants.push(p);return {rows:[{grant:{independentFactor:false,purpose:'credential.activate'}}]}}
 if(sql.startsWith('SELECT credential_id,transports'))return {rows:state.credentials};
 if(sql.startsWith('INSERT INTO rf_webauthn_challenges')){state.challenges.push({id:uuid,subject:p[0],session:p[1],org:p[2],hash:p[3],ceremony:p[4],origin:p[5],rpID:p[6],used:false});return {rows:[{id:uuid}]}}
 if(sql.startsWith('UPDATE rf_webauthn_challenges')){const c=state.challenges.find(x=>x.id===p[0]&&x.subject===p[1]&&x.session===p[2]&&x.org===p[3]&&x.ceremony===p[4]&&x.origin===p[5]&&x.rpID===p[6]&&!x.used);if(c){c.used=true;return {rows:[{challenge_hash:c.hash}]}}return {rows:[]}}
 if(sql.startsWith('INSERT INTO rf_security_events')){state.audits.push(p);return {rows:[]}}
 if(sql.startsWith('INSERT INTO rf_webauthn_credentials')){state.credentials.push({credential_id:p[0],public_key:p[2],sign_count:p[3],transports:JSON.parse(p[6]),device_type:p[4],backed_up:p[5]});return {rows:[]}}
 if(sql.startsWith('SELECT credential_id,public_key'))return {rows:state.credentials.filter(c=>c.credential_id===p[1])};
 if(sql.startsWith('UPDATE rf_webauthn_credentials'))return {rows:[]};
 if(sql.startsWith('INSERT INTO rf_webauthn_grants')){state.grants.push(p);return {rows:[]}}
 if(sql.includes('FROM rf_webauthn_grants'))return {rows:[]};
 return {rows:[]};}}}
const challenge='A'.repeat(43);
const web={async generateRegistrationOptions(){return {challenge,user:{id:'a'}}},async generateAuthenticationOptions(){return {challenge}},
 async verifyRegistrationResponse(arg){assert.equal(arg.expectedOrigin,env.REPAIRFLOW_APP_ORIGIN);assert.equal(arg.expectedRPID,env.REPAIRFLOW_WEBAUTHN_RP_ID);assert.equal(arg.requireUserVerification,true);return {verified:true,registrationInfo:{credential:{id:'credential-id-12345',publicKey:new Uint8Array(65),counter:0,transports:['usb']},credentialDeviceType:'singleDevice',credentialBackedUp:false,userVerified:true}}},
 async verifyAuthenticationResponse(arg){assert.equal(arg.credential.id,'credential-id-12345');assert.equal(arg.requireUserVerification,true);return {verified:true,authenticationInfo:{newCounter:1,userVerified:true,credentialBackedUp:false}}}};
function response(c=challenge,id='credential-id-12345'){return {id,response:{clientDataJSON:Buffer.from(JSON.stringify({challenge:c,origin:env.REPAIRFLOW_APP_ORIGIN,type:'webauthn.create'})).toString('base64url')}}}
test('registration consumes a server challenge, stores public credential and audits without granting administration',async()=>{
 const d=db(),start=await begin(d,identity,org,'registration',env,web);
 assert.equal(start.options.challenge,challenge);
 const result=await finish(d,identity,org,'registration',{challengeId:start.challengeId,response:response()},env,web);
 assert.equal(result.verified,true);assert.equal(result.independentFactor,false);assert.equal(result.state,'pending','first key without bootstrap/admin approval stays pending');
 assert.match(result.fingerprint,/^[0-9A-F]{4}-[0-9A-F]{4}$/);assert.equal(d.state.credentials.length,1);assert.equal(d.state.audits.length,2);
 assert.equal(d.state.calls.some(c=>c.sql.includes('rf_approve_own_credential_by_step_up')),false,'no self-approval without an approved key');
 await assert.rejects(finish(d,identity,org,'registration',{challengeId:start.challengeId,response:response()},env,web),/INVALID_CHALLENGE/);
});
test('authentication binds subject, session and tenant but never yields an unproven independent factor',async()=>{
 const d=db();d.state.credentials.push({credential_id:'credential-id-12345',public_key:Buffer.alloc(65),sign_count:0,transports:['usb'],device_type:'singleDevice',backed_up:false});
 const start=await begin(d,identity,org,'authentication',env,web);
 await assert.rejects(finish(d,{...identity,sessionId:'55555555-5555-4555-8555-555555555555'},org,'authentication',{challengeId:start.challengeId,response:response()},env,web),/INVALID_CHALLENGE/);
 const ok=await finish(d,identity,org,'authentication',{challengeId:start.challengeId,response:response()},env,web);
 assert.deepEqual([ok.verified,ok.independentFactor,ok.purpose],[true,false,'credential.activate']);
 assert.equal(d.state.grants.length,1);assert.deepEqual(d.state.grants[0],[start.challengeId,'credential-id-12345',true,false],'grant is recorded only through the DB function');
 assert.equal(d.state.calls.some(c=>c.sql.startsWith('INSERT INTO rf_webauthn_grants')),false,'runtime never writes grants directly');
 await assert.rejects(requireManagementStepUp(d,identity,org,'session.revoke'),/STEP_UP_REQUIRED/);
 await assert.rejects(requireManagementStepUp(d,identity,org,'credential.activate'),/ACCESS_DENIED/);
 await assert.rejects(begin(d,identity,org,'authentication',env,web,{purpose:'everything'}),/INVALID_INPUT/);
});
test('bad challenge consumes the attempt and cannot be replayed',async()=>{
 const d=db();const start=await begin(d,identity,org,'registration',env,web);
 assert.deepEqual(await finish(d,identity,org,'registration',{challengeId:start.challengeId,response:response('B'.repeat(43))},env,web),{verified:false});
 await assert.rejects(finish(d,identity,org,'registration',{challengeId:start.challengeId,response:response()},env,web),/INVALID_CHALLENGE/);
 assert.equal(d.state.credentials.length,0);
});
test('origin and RP ID are pinned; external origin and unauthenticated API calls stop before DB',async()=>{
 assert.deepEqual(relyingParty(env),{origin:env.REPAIRFLOW_APP_ORIGIN,rpID:env.REPAIRFLOW_WEBAUTHN_RP_ID});
 assert.throws(()=>relyingParty({...env,REPAIRFLOW_WEBAUTHN_RP_ID:'evil.example.net'}),/WEBAUTHN_UNAVAILABLE/);
 function res(){return {code:0,status(n){this.code=n;return this},setHeader(){},json(v){this.body=v;return this}}}
 const base={method:'POST',body:{action:'registrationOptions'},headers:{origin:env.REPAIRFLOW_APP_ORIGIN,'content-type':'application/json'}};
 let r=res();await webauthnHandler({...base,headers:{...base.headers,origin:'https://evil.example.net'}},r,{env});assert.equal(r.code,403);
 r=res();await webauthnHandler(base,r,{env});assert.equal(r.code,401);
});
test('rate limit and old primary sessions refuse registration',async()=>{
 let d=db();d.state.challenges=Array.from({length:5},()=>({}));await assert.rejects(begin(d,identity,org,'registration',env,web),/RATE_LIMITED/);
 d=db();await assert.rejects(begin(d,{...identity,createdAt:new Date(Date.now()-6*60_000).toISOString()},org,'registration',env,web),/RECENT_LOGIN_REQUIRED/);
});
