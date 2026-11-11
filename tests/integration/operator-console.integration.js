'use strict';
// Real PostgreSQL proofs for migration 015: the operator bootstrap code issued from the
// database console (phone-only operator). Same rules as scripts/mfa-bootstrap-code.js;
// the code it returns is redeemed through the unchanged rf_redeem_mfa_bootstrap.
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');const {Client}=require('pg');
const {startIsolatedDatabase,FIX}=require('../harness/postgres');
const {normalizeCode,hashCode}=require('../../lib/credential-management');
const {fingerprint}=require('../../lib/webauthn-step-up');
const U=FIX.users;let db;
before(async()=>{db=await startIsolatedDatabase()});
after(()=>db?.stop());
async function owner(sql,params){const c=new Client({connectionString:db.ownerUrl});await c.connect();try{return (await c.query(sql,params)).rows}finally{await c.end()}}
async function runtime(c0,sql,params){
 const c=new Client({connectionString:db.runtimeUrl});await c.connect();
 try{await c.query('BEGIN');
  await c.query("SELECT set_config('app.subject',$1,true),set_config('app.session_id',$2,true),set_config('app.session_created_at',$3,true),set_config('app.organization_id',$4,true),set_config('app.branch_id',$5,true)",[c0.subject,c0.sessionId,new Date().toISOString(),FIX.orgA,FIX.branchA]);
  const r=typeof sql==='function'?await sql(c):(await c.query(sql,params)).rows;await c.query('COMMIT');return r}
 catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{await c.end()}
}
const issue=(user,{org=FIX.orgA,operator='Eigenaar via Neon-console (synthetisch)',purpose='bootstrap',minutes=15}={})=>
 owner('SELECT * FROM public.rf_operator_issue_bootstrap_code($1,$2,$3,$4,$5)',[org,user.id,operator,purpose,minutes]).then(r=>r[0]);
const KEY='console-manager-key-0001';

test('console code has the app format, only its SHA-256 is stored, 15 minutes by default',async()=>{
 const r=await issue(U.managerA);
 assert.match(r.eenmalige_code,/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}-[0-9A-HJKMNP-TV-Z]$/);
 assert.equal(r.rol,'manager');
 const n=normalizeCode(r.eenmalige_code);assert.ok(n,'accepted by the app normaliser');
 const [row]=await owner('SELECT code_hash,created_by,purpose,expires_at-created_at AS ttl,used_at FROM rf_mfa_bootstrap_codes WHERE id=$1',[r.code_id]);
 assert.equal(row.code_hash,hashCode(n));assert.equal(row.ttl.minutes,15);assert.equal(row.purpose,'bootstrap');assert.equal(row.used_at,null);
 assert.equal(row.created_by,'Eigenaar via Neon-console (synthetisch)');
 const all=JSON.stringify(await owner('SELECT * FROM rf_mfa_bootstrap_codes'));assert.ok(!all.includes(n),'plaintext never stored');
});

test('codes are unpredictable: 200 distinct, all symbols used, no fixed positions',async()=>{
 const seen=new Set(),perPos=Array.from({length:26},()=>new Set());
 for(let i=0;i<200;i++){const n=normalizeCode((await issue(U.managerA)).eenmalige_code);seen.add(n);[...n].forEach((ch,j)=>perPos[j].add(ch))}
 assert.equal(seen.size,200);
 assert.equal(new Set([...seen].join('')).size,32,'whole alphabet appears');
 for(let j=0;j<26;j++)assert.ok(perPos[j].size>=12,'position '+j+' varies ('+perPos[j].size+')');
 const live=await owner("SELECT count(*)::int AS n FROM rf_mfa_bootstrap_codes WHERE identity_subject=$1 AND used_at IS NULL AND invalidated_at IS NULL",[U.managerA.id]);
 assert.equal(live[0].n,1,'issuing invalidates every earlier unused code');
});

test('same refusals as the script: role, tenant, verification, purpose, TTL, operator label',async()=>{
 const refuse=(p,re)=>assert.rejects(p,e=>re.test(e.message),String(re));
 await refuse(issue(U.salesA),/not an active owner\/manager/);
 await refuse(issue(U.managerA,{org:FIX.orgB}),/not an active owner\/manager/);
 await refuse(issue(U.managerA,{purpose:'admin'}),/purpose must be/);
 await refuse(issue(U.managerA,{minutes:0}),/minutes must be/);await refuse(issue(U.managerA,{minutes:31}),/minutes must be/);
 await refuse(issue(U.managerA,{operator:'  '}),/operator must name/);
 await owner('UPDATE neon_auth."user" SET "emailVerified"=false WHERE id=$1',[U.managerA.id]);
 try{await refuse(issue(U.managerA),/unverified/)}finally{await owner('UPDATE neon_auth."user" SET "emailVerified"=true WHERE id=$1',[U.managerA.id])}
});

test('the runtime role can neither execute the function nor read the codes',async()=>{
 const c0={subject:U.managerA.id,sessionId:crypto.randomUUID()};
 await assert.rejects(runtime(c0,'SELECT * FROM public.rf_operator_issue_bootstrap_code($1,$2,$3)',[FIX.orgA,U.managerA.id,'runtime attempt']),e=>e.code==='42501');
 await assert.rejects(runtime(c0,'SELECT * FROM rf_mfa_bootstrap_codes'),e=>e.code==='42501');
 const [p]=await owner("SELECT prosecdef,proacl::text AS acl FROM pg_proc WHERE proname='rf_operator_issue_bootstrap_code'");
 assert.equal(p.prosecdef,false,'SECURITY INVOKER');assert.doesNotMatch(p.acl||'',/rf_runtime/);
});

test('end to end: console code + fresh UV assertion with the NEW key activates exactly that key, once',async()=>{
 await owner(`INSERT INTO rf_webauthn_credentials(credential_id,identity_subject,public_key,device_type,backed_up,user_verified) VALUES($1,$2,$3,'multiDevice',true,true)`,[KEY,U.managerA.id,Buffer.alloc(65,1)]);
 const c0={subject:U.managerA.id,sessionId:crypto.randomUUID()};
 // The runtime part of a verified assertion, exactly as lib/webauthn-step-up.js does it.
 const activate=()=>runtime(c0,async c=>{
  const ch=(await c.query(`INSERT INTO rf_webauthn_challenges(identity_subject,session_id,organization_id,challenge_hash,ceremony,origin,rp_id,purpose)
   VALUES($1,$2,$3,$4,'authentication','https://localhost','localhost','credential.activate') RETURNING id`,[c0.subject,c0.sessionId,FIX.orgA,crypto.randomBytes(32).toString('hex')])).rows[0].id;
  await c.query('UPDATE rf_webauthn_challenges SET consumed_at=now() WHERE id=$1',[ch]);
  return (await c.query('SELECT public.rf_record_webauthn_assertion($1,$2,true,true) AS g',[ch,KEY])).rows[0].g;
 });
 const redeem=code=>runtime(c0,'SELECT public.rf_redeem_mfa_bootstrap($1) AS r',[hashCode(normalizeCode(code))]).then(r=>r[0].r);
 const code=(await issue(U.managerA)).eenmalige_code;
 await assert.rejects(redeem(code),e=>/STEP_UP_REQUIRED/.test(e.message),'code alone never activates');
 assert.equal((await activate()).independentFactor,false,'pending synced passkey is not independent');
 const ok=await redeem(code);assert.equal(ok.activated,true);assert.equal(ok.fingerprint,fingerprint(KEY));
 await activate();await assert.rejects(redeem(code),e=>/STEP_UP_REQUIRED/.test(e.message),'approved key cannot be re-activated');
 const [ap]=await owner('SELECT method,approved_by_subject FROM rf_webauthn_approvals WHERE credential_id=$1 AND revoked_at IS NULL',[KEY]);
 assert.equal(ap.method,'bootstrap');assert.match(ap.approved_by_subject,/^operator:/);
 const [used]=await owner('SELECT used_at IS NOT NULL AS used,used_credential FROM rf_mfa_bootstrap_codes WHERE code_hash=$1',[hashCode(normalizeCode(code))]);
 assert.equal(used.used,true);assert.equal(used.used_credential,KEY);
 await assert.rejects(issue(U.managerA),/already has an approved key/,'no second bootstrap once protected');
 const r=await issue(U.managerA,{purpose:'recovery'});assert.ok(r.code_id,'recovery stays possible for the operator');
});

test('rollback 015 removes only the console function; re-applying 015 restores it',async()=>{
 const fs=require('node:fs'),path=require('node:path');const root=path.join(__dirname,'..','..');
 const before=(await owner('SELECT count(*)::int AS n FROM rf_mfa_bootstrap_codes'))[0].n;
 await owner(fs.readFileSync(path.join(root,'db/rollback/015-operator-console-bootstrap.rollback.sql'),'utf8'));
 assert.equal((await owner("SELECT count(*)::int AS n FROM pg_proc WHERE proname='rf_operator_issue_bootstrap_code'"))[0].n,0);
 assert.equal((await owner('SELECT count(*)::int AS n FROM rf_mfa_bootstrap_codes'))[0].n,before,'issued code rows untouched');
 await owner(fs.readFileSync(path.join(root,'db/migrations/015-operator-console-bootstrap.sql'),'utf8'));
 assert.ok((await issue(U.ownerA)).code_id);
});
