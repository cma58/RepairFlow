'use strict';
// Real PostgreSQL proofs for migration 013 (MFA policy option A). The runtime steps
// performed here (insert challenge, consume it, record assertion) are exactly what
// lib/webauthn-step-up.js does AFTER cryptographic verification; that verification
// itself is proven in the browser suite. These tests prove what the DATABASE refuses
// even if the application layer were wrong or compromised.
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');const {Client}=require('pg');
const {startIsolatedDatabase,FIX,staffId}=require('../harness/postgres');
const {issueBootstrapCode}=require('../../scripts/mfa-bootstrap-code');
const {normalizeCode,hashCode}=require('../../lib/credential-management');
const {fingerprint}=require('../../lib/webauthn-step-up');
const U=FIX.users;let db;
before(async()=>{db=await startIsolatedDatabase()});
after(()=>db?.stop());
async function owner(sql,params){const c=new Client({connectionString:db.ownerUrl});await c.connect();try{return (await c.query(sql,params)).rows}finally{await c.end()}}
const sessions={};
function ctx(user,{org=FIX.orgA,branch=FIX.branchA,session='default',createdAt}={}){
 const key=user.id+':'+session;sessions[key]=sessions[key]||{id:crypto.randomUUID(),createdAt:createdAt||new Date().toISOString()};
 return {subject:user.id,sessionId:sessions[key].id,createdAt:createdAt||sessions[key].createdAt,org,branch};
}
async function asRuntime(c0,fn){
 const c=new Client({connectionString:db.runtimeUrl});await c.connect();
 try{await c.query('BEGIN');
  await c.query("SELECT set_config('app.subject',$1,true),set_config('app.session_id',$2,true),set_config('app.session_created_at',$3,true),set_config('app.organization_id',$4,true),set_config('app.branch_id',$5,true)",[c0.subject,c0.sessionId,c0.createdAt,c0.org,c0.branch]);
  const r=await fn(c);await c.query('COMMIT');return r}
 catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{await c.end()}
}
const denied=(code,re)=>e=>e.code===code&&(!re||re.test(e.message));
async function credential(user,id,{synced=false}={}){
 await owner(`INSERT INTO rf_webauthn_credentials(credential_id,identity_subject,public_key,device_type,backed_up,user_verified) VALUES($1,$2,$3,$4,$5,true)`,
  [id,user.id,Buffer.alloc(65,1),synced?'multiDevice':'singleDevice',synced]);
}
// The runtime part of a verified assertion, inside one transaction like the app.
async function assertion(c0,credentialId,{purpose='credential.activate',uv=true,backedUp=false,consume=true,ceremony='authentication'}={}){
 return asRuntime(c0,async c=>{
  const ch=(await c.query(`INSERT INTO rf_webauthn_challenges(identity_subject,session_id,organization_id,challenge_hash,ceremony,origin,rp_id,purpose)
   VALUES($1,$2,$3,$4,$5,'https://localhost','localhost',$6) RETURNING id`,[c0.subject,c0.sessionId,c0.org,crypto.randomBytes(32).toString('hex'),ceremony,purpose])).rows[0].id;
  if(consume)await c.query('UPDATE rf_webauthn_challenges SET consumed_at=now() WHERE id=$1',[ch]);
  const g=(await c.query('SELECT public.rf_record_webauthn_assertion($1,$2,$3,$4) AS g',[ch,credentialId,uv,backedUp])).rows[0].g;
  return {...g,challengeId:ch};
 });
}
const bootstrap=(user,opts={})=>issueBootstrapCode((s,p)=>owner(s,p).then(rows=>({rows})),{organizationId:FIX.orgA,subject:user.id,operator:'E2E operator (synthetic)',...opts});
const redeem=(c0,code)=>asRuntime(c0,c=>c.query('SELECT public.rf_redeem_mfa_bootstrap($1) AS r',[hashCode(normalizeCode(code))])).then(r=>r.rows[0].r);
const OWNER_KEY='owner-a-key-0000000001',MANAGER_KEY='manager-a-key-00000001';

test('fingerprint is identical in JavaScript and SQL',async()=>{
 const [r]=await owner('SELECT public.rf_credential_fingerprint($1) AS f',[OWNER_KEY]);assert.equal(r.f,fingerprint(OWNER_KEY));
});
test('pending (unapproved) key: valid assertion is NEVER independent, for any purpose',async()=>{
 await credential(U.ownerA,OWNER_KEY);
 for(const purpose of ['credential.activate','session.revoke','invitation.manage'])
  assert.equal((await assertion(ctx(U.ownerA),OWNER_KEY,{purpose})).independentFactor,false,purpose);
 await assert.rejects(asRuntime(ctx(U.ownerA),c=>c.query('SELECT public.rf_revoke_member_session($1,NULL,$2)',[staffId(U.salesA),'synthetic reason text'])),denied('42501',/STEP_UP_REQUIRED/));
});
test('assertion recording refuses: unconsumed challenge, registration ceremony, missing UV, foreign credential, second grant from one challenge',async()=>{
 const c0=ctx(U.ownerA,{session:'record'});
 await assert.rejects(assertion(c0,OWNER_KEY,{consume:false}),denied('42501'));
 await assert.rejects(assertion(c0,OWNER_KEY,{ceremony:'registration'}),denied('42501'));
 await assert.rejects(assertion(c0,OWNER_KEY,{uv:false}),denied('42501'));
 await credential(U.managerA,MANAGER_KEY);
 await assert.rejects(assertion(c0,MANAGER_KEY),denied('42501'),'cannot record an assertion for another subject\'s key');
 const g=await assertion(c0,OWNER_KEY);
 await assert.rejects(asRuntime(c0,c=>c.query('SELECT public.rf_record_webauthn_assertion($1,$2,true,false)',[g.challengeId,OWNER_KEY])),denied('42501'));
});
test('runtime cannot unblock/unrevoke keys, reset challenges, read codes or write approvals/policy',async()=>{
 const c0=ctx(U.ownerA);
 for(const sql of [
  `UPDATE rf_webauthn_credentials SET blocked_at=NULL WHERE credential_id='${OWNER_KEY}'`,
  `UPDATE rf_webauthn_credentials SET revoked_at=NULL WHERE credential_id='${OWNER_KEY}'`,
  `UPDATE rf_webauthn_challenges SET grant_issued_at=NULL`,
  `UPDATE rf_webauthn_challenges SET purpose='session.revoke'`,
  `SELECT * FROM rf_mfa_bootstrap_codes`,
  `INSERT INTO rf_webauthn_approvals(credential_id,identity_subject,organization_id,method,approved_by_subject) VALUES('${OWNER_KEY}','${U.ownerA.id}','${FIX.orgA}','step_up','${U.ownerA.id}')`,
  `INSERT INTO rf_organization_security_policy(organization_id,allow_synced_passkeys) VALUES('${FIX.orgA}',true)`,
  `SELECT public.rf_consume_step_up('session.revoke')`,
 ])await assert.rejects(asRuntime(c0,c=>c.query(sql)),denied('42501'),sql);
});
test('bootstrap: operator code is one-time, subject- and tenant-bound, needs proof of possession of the NEW key',async()=>{
 const c0=ctx(U.ownerA,{session:'bootstrap'});
 const code=await bootstrap(U.ownerA);assert.match(code.code,/^[0-9A-Z]{5}(-[0-9A-Z]{1,5}){5}$/);
 const stored=await owner('SELECT code_hash,expires_at-created_at AS ttl FROM rf_mfa_bootstrap_codes WHERE id=$1',[code.id]);
 assert.equal(stored[0].code_hash,hashCode(normalizeCode(code.code)));assert.equal(stored[0].ttl.minutes,15);
 await assert.rejects(redeem(c0,code.code),denied('42501',/STEP_UP_REQUIRED/),'no activation grant from the new key → refused');
 // Another subject cannot redeem it even with their own activation grant.
 const m0=ctx(U.managerA,{session:'bootstrap'});await assertion(m0,MANAGER_KEY);
 assert.deepEqual(await redeem(m0,code.code),{activated:false});
 await assertion(c0,OWNER_KEY);
 assert.deepEqual(await redeem(c0,'0'.repeat(26)),{activated:false},'wrong code');
 assert.equal((await owner('SELECT failed_attempts FROM rf_mfa_bootstrap_codes WHERE id=$1',[code.id]))[0].failed_attempts,1);
 await assert.rejects(redeem(c0,code.code),denied('42501',/STEP_UP_REQUIRED/),'activation grant is single-use (consumed by the failed attempt)');
 await assertion(c0,OWNER_KEY);
 const ok=await redeem(c0,code.code);assert.equal(ok.activated,true);assert.equal(ok.fingerprint,fingerprint(OWNER_KEY));
 await assertion(c0,OWNER_KEY);await assert.rejects(redeem(c0,code.code),denied('42501',/STEP_UP_REQUIRED/),'an approved key cannot be re-activated');
 await credential(U.ownerA,'owner-a-key-0000000002');await assertion(c0,'owner-a-key-0000000002');
 assert.deepEqual(await redeem(c0,code.code),{activated:false},'used code cannot activate a second key');
 const ap=await owner("SELECT method,approved_by_subject FROM rf_webauthn_approvals WHERE credential_id=$1 AND revoked_at IS NULL",[OWNER_KEY]);
 assert.equal(ap.length,1);assert.equal(ap[0].method,'bootstrap');assert.match(ap[0].approved_by_subject,/^operator:/);
 await assert.rejects(bootstrap(U.ownerA),/already has an approved key/,'operator cannot issue a bootstrap for an already protected admin');
 await assert.rejects(bootstrap(U.salesA),/not an active owner\/manager/);
});
test('bootstrap codes: 5 failures invalidate, expiry enforced, at most 30 minutes',async()=>{
 const m0=ctx(U.managerA,{session:'fail5'});const code=await bootstrap(U.managerA);
 for(let i=0;i<5;i++){await assertion(m0,MANAGER_KEY);assert.deepEqual(await redeem(m0,'1'.repeat(26)),{activated:false})}
 await assertion(m0,MANAGER_KEY);assert.deepEqual(await redeem(m0,code.code),{activated:false},'invalidated after 5 failures');
 const exp=await bootstrap(U.managerA);await owner("UPDATE rf_mfa_bootstrap_codes SET expires_at=created_at+interval '1 second', created_at=now()-interval '1 minute' WHERE id=$1",[exp.id]).catch(()=>{});
 await owner("UPDATE rf_mfa_bootstrap_codes SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1",[exp.id]);
 await assertion(m0,MANAGER_KEY);assert.deepEqual(await redeem(m0,exp.code),{activated:false},'expired');
 await assert.rejects(owner("INSERT INTO rf_mfa_bootstrap_codes(organization_id,identity_subject,purpose,code_hash,created_by,expires_at) VALUES($1,$2,'bootstrap',$3,'x op',now()+interval '31 minutes')",[FIX.orgA,U.managerA.id,'e'.repeat(64)]),denied('23514'));
});
test('approved key: purpose-bound, single-use, expiring independent step-up; consumed atomically by the action',async()=>{
 const c0=ctx(U.ownerA,{session:'purpose'});
 const g=await assertion(c0,OWNER_KEY,{purpose:'invitation.manage'});assert.equal(g.independentFactor,true);
 await assert.rejects(asRuntime(c0,c=>c.query('SELECT public.rf_revoke_member_session($1,NULL,$2)',[staffId(U.salesA),'synthetic reason text'])),denied('42501',/STEP_UP_REQUIRED/),'wrong purpose');
 await assertion(c0,OWNER_KEY,{purpose:'session.revoke'});
 const id=await asRuntime(c0,c=>c.query('SELECT public.rf_revoke_member_session($1,$2,$3) AS id',[staffId(U.salesA),crypto.randomUUID(),'synthetic reason text']));assert.ok(id.rows[0].id);
 await assert.rejects(asRuntime(c0,c=>c.query('SELECT public.rf_revoke_member_session($1,$2,$3)',[staffId(U.salesA),crypto.randomUUID(),'synthetic reason text'])),denied('42501',/STEP_UP_REQUIRED/),'single-use');
 await assertion(c0,OWNER_KEY,{purpose:'session.revoke'});
 await owner("UPDATE rf_webauthn_grants SET expires_at=now()-interval '1 second' WHERE session_id=$1",[c0.sessionId]);
 await assert.rejects(asRuntime(c0,c=>c.query('SELECT public.rf_revoke_member_session($1,NULL,$2)',[staffId(U.salesA),'synthetic reason text'])),denied('42501',/STEP_UP_REQUIRED/),'expired');
 const other=ctx(U.ownerA,{session:'purpose-other'});
 await assert.rejects(asRuntime(other,c=>c.query('SELECT public.rf_revoke_member_session($1,NULL,$2)',[staffId(U.salesA),'synthetic reason text'])),denied('42501',/STEP_UP_REQUIRED/),'not portable to another session');
 const tenantB=ctx(U.ownerA,{session:'purpose',org:FIX.orgB,branch:FIX.branchB});
 assert.equal((await assertion(tenantB,OWNER_KEY,{purpose:'session.revoke'}).catch(e=>({err:e.code}))).independentFactor,false,'approval is per tenant');
});
test('row CHECK: an approved key still needs UV, purpose and challenge for independence',async()=>{
 await assert.rejects(owner(`INSERT INTO rf_webauthn_grants(identity_subject,session_id,organization_id,credential_id,independent_factor,user_verified,purpose,backed_up)
  VALUES($1,$2,$3,$4,true,false,'session.revoke',false)`,[U.ownerA.id,crypto.randomUUID(),FIX.orgA,OWNER_KEY]),e=>['23514','42501'].includes(e.code));
});
test('admin approval: fingerprint must match, no self-approval, owner only, same tenant',async()=>{
 const o0=ctx(U.ownerA,{session:'admin'});
 await assertion(o0,OWNER_KEY,{purpose:'credential.approve'});
 await assert.rejects(asRuntime(o0,c=>c.query('SELECT public.rf_approve_member_credential($1,$2)',[staffId(U.managerA),'0000-0000'])),denied('42501'),'wrong fingerprint');
 await assert.rejects(asRuntime(o0,c=>c.query('SELECT public.rf_approve_member_credential($1,$2)',[staffId(U.ownerA),fingerprint(OWNER_KEY)])),denied('42501'),'self');
 const ok=await asRuntime(o0,c=>c.query('SELECT public.rf_approve_member_credential($1,$2) AS id',[staffId(U.managerA),fingerprint(MANAGER_KEY)]));assert.ok(ok.rows[0].id);
 const m0=ctx(U.managerA,{session:'admin'});
 assert.equal((await assertion(m0,MANAGER_KEY,{purpose:'credential.manage'})).independentFactor,true);
 await assertion(m0,MANAGER_KEY,{purpose:'credential.approve'});
 await assert.rejects(asRuntime(m0,c=>c.query('SELECT public.rf_approve_member_credential($1,$2)',[staffId(U.ownerA),fingerprint(OWNER_KEY)])),denied('42501'),'manager cannot approve');
 const b0=ctx(U.ownerB,{org:FIX.orgB,branch:FIX.branchB});
 await assert.rejects(asRuntime(b0,c=>c.query('SELECT public.rf_approve_member_credential($1,$2)',[staffId(U.managerA),fingerprint(MANAGER_KEY)])),denied('42501'),'cross-tenant');
 const overview=await asRuntime(o0,c=>c.query('SELECT public.rf_member_security_overview() AS m'));
 assert.ok(overview.rows[0].m.every(m=>[U.ownerA,U.managerA].map(staffId).includes(m.staffId)),'owner sees only own-tenant admins');
 await assert.rejects(asRuntime(m0,c=>c.query('SELECT public.rf_member_security_overview()')),denied('42501'),'manager cannot list members');
});
test('synced-passkey policy: when disallowed, a backed-up assertion is not independent; device-bound still is',async()=>{
 await owner('INSERT INTO rf_organization_security_policy(organization_id,allow_synced_passkeys) VALUES($1,false) ON CONFLICT(organization_id) DO UPDATE SET allow_synced_passkeys=false',[FIX.orgA]);
 const o0=ctx(U.ownerA,{session:'sync'});
 assert.equal((await assertion(o0,OWNER_KEY,{purpose:'session.revoke',backedUp:true})).independentFactor,false);
 assert.equal((await assertion(o0,OWNER_KEY,{purpose:'session.revoke',backedUp:false})).independentFactor,true);
 await owner('UPDATE rf_organization_security_policy SET allow_synced_passkeys=true WHERE organization_id=$1',[FIX.orgA]);
});
test('lost key: block needs a fresh login, removes approvals, ends sessions; old grants become unusable',async()=>{
 const m0=ctx(U.managerA,{session:'block'});
 await assertion(m0,MANAGER_KEY,{purpose:'credential.manage'});
 const stale=ctx(U.managerA,{session:'block-stale',createdAt:new Date(Date.now()-11*60000).toISOString()});
 await assert.rejects(asRuntime(stale,c=>c.query('SELECT public.rf_block_own_credential($1,$2)',[fingerprint(MANAGER_KEY),'toestel verloren in de winkel'])),denied('42501',/RECENT_LOGIN_REQUIRED/));
 await asRuntime(m0,c=>c.query('SELECT public.rf_block_own_credential($1,$2)',[fingerprint(MANAGER_KEY),'toestel verloren in de winkel']));
 const [k]=await owner('SELECT blocked_at IS NOT NULL AS b FROM rf_webauthn_credentials WHERE credential_id=$1',[MANAGER_KEY]);assert.equal(k.b,true);
 assert.equal((await owner('SELECT count(*)::int n FROM rf_webauthn_approvals WHERE credential_id=$1 AND revoked_at IS NULL',[MANAGER_KEY]))[0].n,0);
 await assert.rejects(asRuntime(m0,c=>c.query('SELECT public.rf_own_security_status()')),denied('42501'),'current session ended');
 const fresh=ctx(U.managerA,{session:'block-new',createdAt:new Date(Date.now()+1000).toISOString()});
 await assert.rejects(assertion(fresh,MANAGER_KEY),denied('42501'),'blocked key yields no grant');
 const st=await asRuntime(fresh,c=>c.query('SELECT public.rf_own_security_status() AS s'));assert.equal(st.rows[0].s.credentials[0].state,'blocked');
});
test('operator recovery for a sole admin: recovery code activates a NEW pending key only',async()=>{
 const NEW='manager-a-key-00000002';await credential(U.managerA,NEW);
 const m0=ctx(U.managerA,{session:'recover',createdAt:new Date(Date.now()+2000).toISOString()});
 const code=await bootstrap(U.managerA,{purpose:'recovery'});
 await assertion(m0,NEW);const r=await redeem(m0,code.code);assert.equal(r.activated,true);
 assert.equal((await assertion(m0,NEW,{purpose:'credential.manage'})).independentFactor,true);
});
test('race: one bootstrap code redeemed concurrently from two sessions activates exactly one key',async()=>{
 await credential(U.ownerB,'owner-b-race-key-000001');await credential(U.ownerB,'owner-b-race-key-000002');
 const b=(n)=>ctx(U.ownerB,{org:FIX.orgB,branch:FIX.branchB,session:'race'+n});
 const code=await issueBootstrapCode((q,p)=>owner(q,p).then(rows=>({rows})),{organizationId:FIX.orgB,subject:U.ownerB.id,operator:'E2E operator (synthetic)'});
 await assertion(b(1),'owner-b-race-key-000001');await assertion(b(2),'owner-b-race-key-000002');
 const results=await Promise.all([redeem(b(1),code.code),redeem(b(2),code.code)]);
 assert.deepEqual(results.map(r=>r.activated).sort(),[false,true]);
 assert.equal((await owner('SELECT count(*)::int n FROM rf_webauthn_approvals WHERE identity_subject=$1 AND revoked_at IS NULL',[U.ownerB.id]))[0].n,1);
});
test('race: one step-up used by five parallel management calls authorizes exactly one',async()=>{
 const key=(await owner("SELECT a.credential_id FROM rf_webauthn_approvals a WHERE a.identity_subject=$1 AND a.revoked_at IS NULL",[U.ownerB.id]))[0].credential_id;
 const b0=ctx(U.ownerB,{org:FIX.orgB,branch:FIX.branchB,session:'race-stepup'});
 assert.equal((await assertion(b0,key,{purpose:'session.revoke'})).independentFactor,true);
 const calls=await Promise.allSettled(Array.from({length:5},()=>asRuntime(b0,c=>c.query('SELECT public.rf_revoke_member_session($1,$2,$3)',[staffId(U.ownerB),crypto.randomUUID(),'synthetic parallel revoke']))));
 assert.equal(calls.filter(c=>c.status==='fulfilled').length,1);
 assert.ok(calls.filter(c=>c.status==='rejected').every(c=>c.reason.code==='42501'));
});
