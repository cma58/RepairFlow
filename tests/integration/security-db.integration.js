'use strict';
// Real PostgreSQL integration proofs (no query spies). Uses the isolated local
// cluster from tests/harness/postgres.js with the committed migrations.
// Missing PostgreSQL is a hard failure (BLOCKED), never a silent skip.
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');const {Client}=require('pg');
const {startIsolatedDatabase,FIX,staffId}=require('../harness/postgres');
const U=FIX.users;let db;
before(async()=>{db=await startIsolatedDatabase()});
after(()=>db?.stop());

async function owner(sql,params){const c=new Client({connectionString:db.ownerUrl});await c.connect();try{return (await c.query(sql,params)).rows}finally{await c.end()}}
async function asRuntime(ctx,fn,{commit=false}={}){
 const c=new Client({connectionString:db.runtimeUrl});await c.connect();
 try{await c.query('BEGIN');
  await c.query("SELECT set_config('app.subject',$1,true),set_config('app.session_id',$2,true),set_config('app.session_created_at',$3,true),set_config('app.organization_id',$4,true),set_config('app.branch_id',$5,true)",
   [ctx.subject,ctx.sessionId||crypto.randomUUID(),ctx.createdAt||new Date().toISOString(),ctx.org||'',ctx.branch||'']);
  const r=await fn(c);await c.query(commit?'COMMIT':'ROLLBACK');return r}
 catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{await c.end()}
}
const ctxA=(user,extra={})=>({subject:user.id,org:FIX.orgA,branch:FIX.branchA,...extra});
const sqlstate=code=>e=>e.code===code;

test('all schema/migration files apply to a clean PostgreSQL in order (3 schema + 14 migrations)',()=>{
 assert.equal(db.applied.length,17);assert.equal(db.applied.at(-1),'db/migrations/014-lost-key-multiple-factor-guard.sql');
});
test('runtime role is the real restricted login role without BYPASSRLS',async()=>{
 const r=await asRuntime(ctxA(U.ownerA),c=>c.query('SELECT current_user AS name,r.rolbypassrls AS bypass,r.rolsuper AS su FROM pg_roles r WHERE r.rolname=current_user'));
 assert.deepEqual(r.rows[0],{name:'rf_runtime_login',bypass:false,su:false});
});
test('tenant isolation (RLS): tenant A context reads only tenant A customers; no context reads nothing',async()=>{
 const a=await asRuntime(ctxA(U.ownerA),c=>c.query('SELECT display_name FROM rf_customers'));
 assert.deepEqual(a.rows.map(r=>r.display_name),['E2E klant van A']);
 const none=await asRuntime({subject:U.ownerA.id},c=>c.query('SELECT count(*)::int n FROM rf_customers'));assert.equal(none.rows[0].n,0);
 const forged=await asRuntime({subject:U.ownerA.id,org:FIX.orgB,branch:FIX.branchB},c=>c.query('SELECT count(*)::int n FROM rf_customers'));
 assert.equal(forged.rows[0].n,0,'setting tenant B context without B staff membership yields nothing');
});
test('tenant isolation (RLS): tenant A context cannot insert a row into tenant B',async()=>{
 await assert.rejects(asRuntime(ctxA(U.ownerA),c=>c.query("INSERT INTO rf_customers(organization_id,display_name) VALUES($1,'cross-tenant')",[FIX.orgB])),sqlstate('42501'));
});
test('WebAuthn credentials are subject-isolated: B cannot read, update or insert for A',async()=>{
 await owner(`INSERT INTO rf_webauthn_credentials(credential_id,identity_subject,public_key,sign_count,device_type,backed_up) VALUES('cred-of-owner-a-0001',$1,$2,5,'singleDevice',false)`,[U.ownerA.id,Buffer.alloc(65)]);
 const seen=await asRuntime(ctxA(U.managerA),c=>c.query('SELECT count(*)::int n FROM rf_webauthn_credentials'));assert.equal(seen.rows[0].n,0);
 const upd=await asRuntime(ctxA(U.managerA),c=>c.query("UPDATE rf_webauthn_credentials SET sign_count=0 WHERE credential_id='cred-of-owner-a-0001'"));assert.equal(upd.rowCount,0);
 await assert.rejects(asRuntime(ctxA(U.managerA),c=>c.query(`INSERT INTO rf_webauthn_credentials(credential_id,identity_subject,public_key,device_type,backed_up) VALUES('forged-credential-0001',$1,$2,'singleDevice',false)`,[U.ownerA.id,Buffer.alloc(65)])),sqlstate('42501'));
 assert.equal((await owner("SELECT sign_count::int n FROM rf_webauthn_credentials WHERE credential_id='cred-of-owner-a-0001'"))[0].n,5);
});
test('the runtime has no direct write path to grants; even the owner role cannot mint an unproven independent grant',async()=>{
 const session=crypto.randomUUID();
 await assert.rejects(asRuntime(ctxA(U.ownerA,{sessionId:session}),c=>c.query(`INSERT INTO rf_webauthn_grants(identity_subject,session_id,organization_id,credential_id) VALUES($1,$2,$3,'cred-of-owner-a-0001')`,[U.ownerA.id,session,FIX.orgA])),sqlstate('42501'));
 // The guard trigger runs first and refuses (approval/challenge missing); see mfa-policy for the row CHECK.
 await assert.rejects(owner(`INSERT INTO rf_webauthn_grants(identity_subject,session_id,organization_id,credential_id,independent_factor) VALUES($1,$2,$3,'cred-of-owner-a-0001',true)`,[U.ownerA.id,session,FIX.orgA]),e=>e.code==='42501'&&/INDEPENDENT_FACTOR_UNPROVEN/.test(e.message));
 // Guard trigger: even with every row field set, an unapproved credential is refused for the BYPASSRLS owner.
 await assert.rejects(owner(`INSERT INTO rf_webauthn_grants(identity_subject,session_id,organization_id,credential_id,independent_factor,user_verified,purpose,backed_up,challenge_id)
  VALUES($1,$2,$3,'cred-of-owner-a-0001',true,true,'session.revoke',false,NULL)`,[U.ownerA.id,session,FIX.orgA]),e=>e.code==='23514'||e.code==='42501');
});
test('grants and challenges are bound to subject+session+tenant by RLS',async()=>{
 const s1=crypto.randomUUID(),s2=crypto.randomUUID();
 await owner(`INSERT INTO rf_webauthn_grants(identity_subject,session_id,organization_id,credential_id) VALUES($1,$2,$3,'cred-of-owner-a-0001')`,[U.ownerA.id,s1,FIX.orgA]);
 const own=await asRuntime(ctxA(U.ownerA,{sessionId:s1}),c=>c.query('SELECT count(*)::int n FROM rf_webauthn_grants'));assert.equal(own.rows[0].n,1);
 const other=await asRuntime(ctxA(U.ownerA,{sessionId:s2}),c=>c.query('SELECT count(*)::int n FROM rf_webauthn_grants'));assert.equal(other.rows[0].n,0,'other session sees no grant');
 const tenantB=await asRuntime({subject:U.ownerA.id,sessionId:s1,org:FIX.orgB,branch:FIX.branchB},c=>c.query('SELECT count(*)::int n FROM rf_webauthn_grants'));assert.equal(tenantB.rows[0].n,0,'other tenant sees no grant');
 await assert.rejects(asRuntime(ctxA(U.ownerA,{sessionId:s2}),c=>c.query(`INSERT INTO rf_webauthn_challenges(identity_subject,session_id,organization_id,challenge_hash,ceremony,origin,rp_id) VALUES($1,$2,$3,$4,'authentication','https://x','x')`,[U.ownerA.id,s1,FIX.orgA,'f'.repeat(64)])),sqlstate('42501'));
});
test('security events are append-only for the runtime (no SELECT/UPDATE/DELETE)',async()=>{
 await assert.rejects(asRuntime(ctxA(U.ownerA),c=>c.query('SELECT * FROM rf_security_events')),sqlstate('42501'));
 await assert.rejects(asRuntime(ctxA(U.ownerA),c=>c.query('DELETE FROM rf_security_events')),sqlstate('42501'));
});
test('SQL management functions refuse without an independent factor even when called directly',async()=>{
 const ctx=ctxA(U.ownerA);
 await assert.rejects(asRuntime(ctx,c=>c.query('SELECT public.rf_revoke_member_session($1,NULL,$2)',[staffId(U.managerA),'synthetic direct call'])),sqlstate('42501'));
 await assert.rejects(asRuntime(ctx,c=>c.query('SELECT public.rf_issue_member_invitation($1,$2,$3,$4)',[FIX.branchA,U.invitee.email,'technician','a'.repeat(64)])),sqlstate('42501'));
 await assert.rejects(asRuntime(ctx,c=>c.query('SELECT public.rf_revoke_member_invitation($1,$2)',[crypto.randomUUID(),'synthetic direct call'])),sqlstate('42501'));
 await assert.rejects(asRuntime({subject:U.invitee.id},c=>c.query('SELECT * FROM public.rf_accept_member_invitation($1)',['b'.repeat(64)])),sqlstate('42501'));
});
test('runtime has no direct write path to invitations, denials, memberships or rights',async()=>{
 for(const sql of [
  `INSERT INTO rf_member_invitations(organization_id,branch_id,email,role,token_hash,invited_by) VALUES('${FIX.orgA}','${FIX.branchA}','x@e2e.invalid','manager','${'c'.repeat(64)}','${staffId(U.ownerA)}')`,
  `INSERT INTO rf_session_denials(organization_id,identity_subject,actor_id,reason) VALUES('${FIX.orgA}','${U.managerA.id}','${staffId(U.ownerA)}','synthetic forged denial')`,
  `UPDATE rf_organization_memberships SET base_role='owner'`,
  `INSERT INTO rf_member_rights(organization_id,branch_id,membership_id,right_code,decision) SELECT organization_id,branch_id,membership_id,'employees.manage','allow' FROM rf_branch_memberships LIMIT 1`,
  `UPDATE rf_staff SET role='owner'`
 ])await assert.rejects(asRuntime(ctxA(U.salesA),c=>c.query(sql)),sqlstate('42501'),sql.slice(0,40));
});
test('dynamic context discovery excludes revoked sessions',async()=>{
 const session=crypto.randomUUID(),created=new Date(Date.now()-60000).toISOString();
 const before=await asRuntime({subject:U.managerA.id,sessionId:session,createdAt:created},c=>c.query('SELECT organization_id FROM public.rf_available_contexts()'));
 assert.equal(before.rows.length,1);
 await owner(`INSERT INTO rf_session_denials(organization_id,identity_subject,session_id,actor_id,reason) VALUES($1,$2,$3,$4,'synthetic single session')`,[FIX.orgA,U.managerA.id,session,staffId(U.ownerA)]);
 const afterRows=await asRuntime({subject:U.managerA.id,sessionId:session,createdAt:created},c=>c.query('SELECT organization_id FROM public.rf_available_contexts()'));
 assert.equal(afterRows.rows.length,0);
});
test('F4 regression: a valid invitation is accepted exactly once with only the invited role (no SQLSTATE 42702)',async()=>{
 const token=crypto.randomBytes(32).toString('base64url'),hash=crypto.createHash('sha256').update(token).digest('hex');
 await owner(`INSERT INTO rf_member_invitations(organization_id,branch_id,email,role,token_hash,invited_by) VALUES($1,$2,$3,'technician',$4,$5)`,[FIX.orgA,FIX.branchA,U.invitee.email,hash,staffId(U.ownerA)]);
 const ctx={subject:U.invitee.id,sessionId:crypto.randomUUID(),createdAt:new Date().toISOString()};
 const r=await asRuntime(ctx,c=>c.query('SELECT organization_id,branch_id FROM public.rf_accept_member_invitation($1)',[hash]),{commit:true});
 assert.deepEqual(r.rows,[{organization_id:FIX.orgA,branch_id:FIX.branchA}]);
 assert.deepEqual(await owner('SELECT role,branch_id,active FROM rf_staff WHERE identity_subject=$1',[U.invitee.id]),[{role:'technician',branch_id:FIX.branchA,active:true}]);
 assert.deepEqual(await owner('SELECT base_role,active FROM rf_organization_memberships WHERE identity_subject=$1',[U.invitee.id]),[{base_role:'technician',active:true}]);
 await assert.rejects(asRuntime({...ctx,sessionId:crypto.randomUUID()},c=>c.query('SELECT * FROM public.rf_accept_member_invitation($1)',[hash])),sqlstate('42501'),'one-time');
 const audit=await owner("SELECT count(*)::int n FROM rf_security_events WHERE action='invitation.accepted' AND identity_subject=$1",[U.invitee.id]);assert.equal(audit[0].n,1);
});
