'use strict';
// P0 security browser E2E — real Chrome, CDP virtual WebAuthn authenticators,
// real api/ entrypoints + lib/ handlers, real PostgreSQL with committed migrations.
//
// Two isolated databases:
//  STRICT  — migrations exactly as committed (independent_factor CHECK in force).
//  POLICY  — identical, but the test drops rf_webauthn_no_unproven_factor and marks
//            a grant independent ONLY AFTER a real WebAuthn verification in that
//            session. This simulates a future owner-approved factor policy to test
//            the downstream gates (revocation, invitations). It is NOT evidence that
//            the current factor is independent, and is reported as POLICY-SIMULATED.
//
// Substituted (and therefore NOT proven here): the real Neon Auth provider and the
// magic-link mailbox flow (synthetic /get-session), Vercel's runtime, Neon's network.
// Missing PostgreSQL or Chrome fails the run (BLOCKED); nothing is silently skipped.
const {describe,it,before,after}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {Client}=require('pg');
const {startIsolatedDatabase,FIX,staffId}=require('../harness/postgres');
const {createSyntheticNeonAuth}=require('../harness/synthetic-neon-auth');
const {startAppServer}=require('../harness/app-server');
const {launch,browserSession,ARTIFACTS}=require('../harness/browser');
const U=FIX.users;
const T={timeout:90000};
let strict,policy,browserInfo,browser;const apps={};const open=[];const evidence=[];
function record(scenario,check,mode,detail){evidence.push({scenario,check,mode,result:'PASS',detail})}
async function sql(dbx,q,p){const c=new Client({connectionString:dbx.ownerUrl});await c.connect();try{return (await c.query(q,p)).rows}finally{await c.end()}}
async function session(app,user,opts){const s=await browserSession(browser,app,app.auth,user,opts);open.push(s);return s}
async function independentFactorSimulated(dbx,s){
 const r=await sql(dbx,"UPDATE rf_webauthn_grants SET independent_factor=true WHERE session_id=$1 AND identity_subject=$2 AND expires_at>now() RETURNING 1",[s.session.sessionId,s.user.id]);
 assert.equal(r.length,1,'a grant must exist from a REAL WebAuthn verification in this very session before simulation');
}
async function registerAndVerify(s){
 const reg=await s.ceremony('registration');assert.equal(reg.status,200,JSON.stringify(reg.body));assert.equal(reg.body.verified,true);
 const auth=await s.ceremony('authentication');assert.equal(auth.status,200,JSON.stringify(auth.body));assert.equal(auth.body.verified,true);
 return {reg,auth};
}
const revokeBody=(target,sessionId)=>({action:'revokeSession',targetStaffId:staffId(target),sessionId,reason:'synthetic e2e revocation reason'});

before(async()=>{
 strict={db:await startIsolatedDatabase()};strict.auth=createSyntheticNeonAuth(strict.db.ownerUrl);
 policy={db:await startIsolatedDatabase()};policy.auth=createSyntheticNeonAuth(policy.db.ownerUrl);
 await sql(policy.db,'ALTER TABLE rf_webauthn_grants DROP CONSTRAINT rf_webauthn_no_unproven_factor');
 const mk=async(name,dbx,org,branch,dynamicContext=false)=>{apps[name]=await startAppServer({database:dbx.db,auth:dbx.auth,organizationId:org,branchId:branch,dynamicContext});apps[name].auth=dbx.auth;apps[name].dbx=dbx};
 await mk('strictA',strict,FIX.orgA,FIX.branchA);await mk('strictB',strict,FIX.orgB,FIX.branchB);
 await mk('strictADynamic',strict,FIX.orgA,FIX.branchA,true);
 await mk('policyA',policy,FIX.orgA,FIX.branchA);await mk('policyB',policy,FIX.orgB,FIX.branchB);
 browserInfo=await launch(Object.values(apps).map(a=>a.spki));browser=browserInfo.browser;
});
after(async()=>{
 for(const s of open)await s.close().catch(()=>{});
 await browser?.close().catch(()=>{});
 for(const a of Object.values(apps))await a.close().catch(()=>{});
 strict?.db.stop();policy?.db.stop();
 fs.mkdirSync(ARTIFACTS,{recursive:true});
 fs.writeFileSync(path.join(ARTIFACTS,'evidence.json'),JSON.stringify({generatedAt:new Date().toISOString(),browser:browserInfo&&{version:browserInfo.version,executablePath:browserInfo.executablePath},node:process.version,
  migrations:strict?.db.applied,checks:evidence},null,1));
});

describe('Scenario A — beheerderslogin, verplichte tweede factor en WebAuthn',()=>{
 let O1,O1b,O2,M;
 const freshAssertion=s=>s.page.evaluate(async()=>{const post=b=>fetch('/api/security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
  const o=await post({action:'authenticationOptions'});if(!o.ok)throw Error('options '+o.status);const ob=await o.json();
  const response=await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:ob.options});return {action:'authenticationVerify',challengeId:ob.challengeId,response}});
 async function withSameKey(app,user,source,label){const s=await session(app,user,{label});const [cred]=await source.credentials();await s.cdp.send('WebAuthn.addCredential',{authenticatorId:s.authenticatorId,credential:cred});return s}
 it('A1 primaire login: Neon-sessie geverifieerd, rol opgehaald, maar nog geen beheerbevoegdheid',T,async()=>{
  O1=await session(apps.strictA,U.ownerA,{label:'A-owner-session1'});
  assert.equal(await O1.page.evaluate(()=>window.isSecureContext),true);
  const s=await O1.api('/api/auth/session');assert.equal(s.status,200);assert.deepEqual(s.body,{authenticated:true,authorized:false,reason:'staff_authorization_pending'});
  const me=await O1.api('/api/auth/me');assert.deepEqual(me,{status:200,body:{authenticated:true,role:'owner'}});
  record('A','primary login verified; role resolved server-side','strict',{me:me.body});
 });
 it('A2 tweede factor verplicht: beheeracties na alleen primaire login geweigerd (403)',T,async()=>{
  assert.equal((await O1.api('/api/security',revokeBody(U.managerA,null))).status,403);
  assert.equal((await O1.api('/api/security',{action:'issue',branchId:FIX.branchA,email:'x@e2e.invalid',role:'technician'})).status,403);
  assert.deepEqual(await O1.api('/api/security',{action:'authenticationOptions'}),{status:400,body:{error:'no_credential'}});
  record('A','management actions denied after primary-only login','strict',{});
 });
 it('A2b registratie vereist een recente primaire login (<5 min)',T,async()=>{
  const stale=await session(apps.strictA,U.ownerA,{ageSeconds:6*60,label:'A-owner-stale'});
  assert.deepEqual(await stale.api('/api/security',{action:'registrationOptions'}),{status:403,body:{error:'recent_login_required'}});
  record('A','registration refused for primary session older than 5 minutes','strict',{});
 });
 it('A3 registratie via de echte UI-knop met virtuele authenticator; enkel publieke sleutel opgeslagen',T,async()=>{
  await O1.page.click('#register');
  await O1.page.waitForFunction(()=>/geregistreerd/i.test(document.getElementById('status').textContent),null,{timeout:20000});
  await O1.screenshot('A3-registration-ui');
  const rows=await sql(strict.db,'SELECT credential_id,identity_subject,octet_length(public_key) AS len,device_type,backed_up,transports FROM rf_webauthn_credentials WHERE identity_subject=$1',[U.ownerA.id]);
  assert.equal(rows.length,1);assert.ok(rows[0].len>=32&&rows[0].len<=4096,'COSE public key only, length '+rows[0].len);
  const [cred]=await O1.credentials();assert.equal(rows[0].credential_id,cred.credentialId.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''));
  const cols=await sql(strict.db,"SELECT string_agg(column_name,',' ORDER BY ordinal_position) c FROM information_schema.columns WHERE table_name='rf_webauthn_credentials'");assert.doesNotMatch(cols[0].c,/private|secret/i);
  record('A','real browser registration via security.html; only public key stored','strict',{coseKeyBytes:rows[0].len,deviceType:rows[0].device_type,backedUp:rows[0].backed_up,transports:rows[0].transports});
 });
 it('A3b ongeldige challenge geweigerd: gemanipuleerde challenge en vervalste challengeId',T,async()=>{
  const tampered=await O1.ceremony('authentication',{tamper:'challenge'});assert.deepEqual([tampered.status,tampered.body],[400,{verified:false}]);
  const forgedId=await O1.ceremony('authentication',{tamper:'challengeId'});assert.deepEqual([forgedId.status,forgedId.body],[400,{error:'invalid_challenge'}]);
  const grants=await sql(strict.db,'SELECT count(*)::int n FROM rf_webauthn_grants WHERE session_id=$1',[O1.session.sessionId]);assert.equal(grants[0].n,0);
  const rejected=await sql(strict.db,"SELECT count(*)::int n FROM rf_security_events WHERE action='webauthn.rejected' AND session_id=$1",[O1.session.sessionId]);assert.ok(rejected[0].n>=1);
  record('A','tampered challenge and forged challengeId rejected; no grant; audited','strict',{});
 });
 it('A4 geldige challenge geaccepteerd: sessie- en tenantgebonden grant, 5 minuten, niet onafhankelijk',T,async()=>{
  const ok=await O1.ceremony('authentication');assert.deepEqual([ok.status,ok.body],[200,{verified:true,independentFactor:false}]);
  const g=await sql(strict.db,"SELECT identity_subject,organization_id,independent_factor,round(extract(epoch FROM expires_at-verified_at))::int AS ttl FROM rf_webauthn_grants WHERE session_id=$1",[O1.session.sessionId]);
  assert.deepEqual(g,[{identity_subject:U.ownerA.id,organization_id:FIX.orgA,independent_factor:false,ttl:300}]);
  O1.lastAuth=ok;record('A','valid assertion verified with real crypto; grant bound to subject/session/tenant, ttl 300s','strict',{grant:g[0]});
 });
 it('A5 hergebruik geweigerd: replay en gelijktijdige dubbele indiening',T,async()=>{
  assert.deepEqual(await O1.replay(O1.lastAuth.payload),{status:400,body:{error:'invalid_challenge'}});
  const payload=await freshAssertion(O1);
  const race=await O1.page.evaluate(async body=>{const post=()=>fetch('/api/security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   return (await Promise.all([post(),post(),post()])).map(r=>r.status).sort()},payload);
  assert.deepEqual(race,[200,400,400]);
  record('A','replay rejected; 3 concurrent submissions of one assertion → exactly one accepted','strict',{race});
 });
 it('A5r rate limit: zesde challenge binnen 15 minuten in dezelfde sessie geweigerd (429)',T,async()=>{
  const n=await sql(strict.db,'SELECT count(*)::int n FROM rf_webauthn_challenges WHERE session_id=$1',[O1.session.sessionId]);assert.equal(n[0].n,5);
  assert.deepEqual(await O1.api('/api/security',{action:'authenticationOptions'}),{status:429,body:{error:'rate_limited'}});
  record('A','6th challenge in 15 minutes for one session rejected with 429','strict',{});
 });
 it('A5b binding: assertion geweigerd in andere sessie van dezelfde gebruiker en bij andere gebruiker',T,async()=>{
  O1b=await withSameKey(apps.strictA,U.ownerA,O1,'A-owner-session1b');
  O2=await session(apps.strictA,U.ownerA,{label:'A-owner-session2'});M=await session(apps.strictA,U.managerA,{label:'A-manager'});
  const fresh=await freshAssertion(O1b);
  assert.deepEqual(await O2.replay(fresh),{status:400,body:{error:'invalid_challenge'}});
  assert.deepEqual(await M.replay(fresh),{status:400,body:{error:'invalid_challenge'}});
  assert.deepEqual(await O1b.replay(fresh),{status:200,body:{verified:true,independentFactor:false}},'the untouched challenge still works in its own session');
  record('A','challenge bound to session and user (cross-session and cross-user replay rejected)','strict',{});
 });
 it('A5c verlopen challenge geweigerd',T,async()=>{
  const pending=await freshAssertion(O1b);
  await sql(strict.db,"UPDATE rf_webauthn_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[pending.challengeId]);
  assert.deepEqual(await O1b.replay(pending),{status:400,body:{error:'invalid_challenge'}});
  record('A','expired challenge (3 min TTL simulated) rejected','strict',{});
 });
 it('A6 beheeracties blijven geweigerd ná echte WebAuthn-verificatie (onafhankelijke factor niet bewezen; fail-closed)',T,async()=>{
  const g=await sql(strict.db,'SELECT count(*)::int n FROM rf_webauthn_grants WHERE session_id=$1 AND expires_at>now()',[O1.session.sessionId]);assert.equal(g[0].n,1);
  assert.equal((await O1.api('/api/security',revokeBody(U.managerA,null))).status,403);
  assert.equal((await O1.api('/api/security',{action:'issue',branchId:FIX.branchA,email:'x@e2e.invalid',role:'technician'})).status,403);
  record('A','with a live WebAuthn grant the committed policy still denies management actions (by design)','strict',{});
 });
 it('A7 F2-regressie: tweede sessie kan zonder step-up geen eigen sleutel toevoegen; mét step-up (zelfde fysieke sleutel) wel',T,async()=>{
  const denied=await O2.ceremony('registration');assert.deepEqual([denied.step,denied.status,denied.body],['options',403,{error:'step_up_required'}]);
  await O2.page.click('#register');await O2.page.waitForFunction(()=>/Bevestig eerst/i.test(document.getElementById('status').textContent),null,{timeout:20000});await O2.screenshot('A7-step-up-required-ui');
  // Copy from the most recently used authenticator (O1b): an older copy would carry a
  // lower signature counter and is (correctly) rejected as a possible clone.
  const [cred]=await O1b.credentials();await O2.cdp.send('WebAuthn.addCredential',{authenticatorId:O2.authenticatorId,credential:cred});
  const step=await O2.ceremony('authentication');assert.equal(step.status,200,JSON.stringify(step.body));
  // Plug a second, brand-new key into this device and enroll it after step-up.
  await O2.cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId:O2.authenticatorId});
  await O2.cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'usb',hasResidentKey:false,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  const added=await O2.ceremony('registration');assert.deepEqual([added.status,added.body],[200,{verified:true,independentFactor:false}]);
  const n=await sql(strict.db,'SELECT count(*)::int n FROM rf_webauthn_credentials WHERE identity_subject=$1',[U.ownerA.id]);assert.equal(n[0].n,2);
  record('A','F2 fixed: enrollment of an additional key requires step-up with an existing key in the same session','strict',{});
 });
 it('A8 credential counter: teruggezette/gekloonde authenticator geweigerd',T,async()=>{
  await registerAndVerify(M);
  await sql(strict.db,'UPDATE rf_webauthn_credentials SET sign_count=1000 WHERE identity_subject=$1',[U.managerA.id]);
  const r=await M.ceremony('authentication');assert.deepEqual([r.status,r.body],[400,{verified:false}]);
  record('A','authenticator counter lower than stored value rejected (clone detection)','strict',{});
 });
});

describe('Scenario A/B/C — POLICY-SIMULATED beheergrens (onafhankelijke factor gesimuleerd ná echte WebAuthn)',()=>{
 let P1,P2,PM1,PM2,inv;
 it('A7p beschermde actie toegestaan ná echte WebAuthn + gesimuleerde policy; zonder die policy niet',T,async()=>{
  P1=await session(apps.policyA,U.ownerA,{label:'P-owner-session1'});
  PM1=await session(apps.policyA,U.managerA,{label:'P-manager-session1'});
  PM2=await session(apps.policyA,U.managerA,{label:'P-manager-session2'});
  await registerAndVerify(P1);
  assert.equal((await P1.api('/api/security',revokeBody(U.salesA,crypto.randomUUID()))).status,403,'real grant alone is not enough');
  await independentFactorSimulated(policy.db,P1);
  const ok=await P1.api('/api/security',revokeBody(U.salesA,crypto.randomUUID()));assert.equal(ok.status,200,JSON.stringify(ok.body));assert.equal(ok.body.scope,'organization_only');
  record('A','gate opens only with live independent grant for this session','policy-simulated',{});
 });
 it('A8p verlopen MFA-status: beheeractie weer geweigerd',T,async()=>{
  await sql(policy.db,"UPDATE rf_webauthn_grants SET expires_at=now()-interval '1 second' WHERE session_id=$1",[P1.session.sessionId]);
  assert.equal((await P1.api('/api/security',revokeBody(U.salesA,null))).status,403);
  await P1.ceremony('authentication');await independentFactorSimulated(policy.db,P1);
  record('A','expired grant denied; fresh step-up required','policy-simulated',{});
 });
 it('C1 twee onafhankelijke browsercontexten met dezelfde gebruiker hebben afzonderlijke sessies',T,async()=>{
  assert.notEqual(PM1.session.sessionId,PM2.session.sessionId);
  for(const s of [PM1,PM2])assert.equal((await s.api('/api/workspace')).status,200);
  const cookies=[...(await PM1.ctx.cookies()),...(await PM2.ctx.cookies())].map(c=>c.value);assert.equal(new Set(cookies).size,2);
  record('C','same user, two independent browser contexts, two distinct provider sessions','policy-simulated',{});
 });
 it('C3/C4/C5 één sessie intrekken: ingetrokken sessie server-side geweigerd, andere sessie werkt',T,async()=>{
  const r=await P1.api('/api/security',revokeBody(U.managerA,PM1.session.sessionId));assert.equal(r.status,200);
  assert.equal((await PM1.api('/api/workspace')).status,403);
  assert.equal((await PM1.api('/api/auth/me')).status,403,'F1 fixed: /api/auth/me also refuses the revoked session');
  assert.equal((await PM1.api('/api/security',{action:'registrationOptions'})).status,403);
  assert.equal((await PM1.api('/api/workspace',{action:'customer',requestId:crypto.randomUUID(),type:'individual',name:'E2E revoked write',email:'',phone:''})).status,403);
  assert.equal((await PM2.api('/api/workspace')).status,200);assert.deepEqual((await PM2.api('/api/auth/me')).body,{authenticated:true,role:'manager'});
  record('C','single-session revocation enforced on workspace GET/POST, me and security routes; sibling session unaffected','policy-simulated',{});
 });
 it('C6 alle sessies intrekken: bestaande sessies geweigerd, nieuwe login toegestaan',T,async()=>{
  assert.equal((await P1.api('/api/security',revokeBody(U.managerA,null))).status,200);
  assert.equal((await PM2.api('/api/workspace')).status,403);
  await new Promise(r=>setTimeout(r,1100));
  const PM3=await session(apps.policyA,U.managerA,{label:'P-manager-session3'});assert.equal((await PM3.api('/api/workspace')).status,200);
  record('C','revoke-all denies existing sessions; a new login afterwards works','policy-simulated',{});
 });
 it('C7 oude MFA-status niet herbruikbaar in een andere sessie of na uitloggen',T,async()=>{
  P2=await session(apps.policyA,U.ownerA,{label:'P-owner-session2'});
  assert.equal((await P2.api('/api/security',revokeBody(U.salesA,null))).status,403,'grant of session 1 does not apply to session 2');
  const out=await P1.api('/api/auth/logout',{});assert.deepEqual(out,{status:200,body:{signedOut:true}});
  assert.equal((await P1.api('/api/workspace')).status,401);
  const left=await sql(policy.db,'SELECT count(*)::int n FROM neon_auth.session WHERE id=$1',[P1.session.sessionId]);assert.equal(left[0].n,0);
  record('C','grant not portable across sessions; logout ends provider session and access','policy-simulated',{});
 });
 it('B6 onbevoegde gebruikers kunnen geen uitnodigingen beheren',T,async()=>{
  const S=await session(apps.policyA,U.salesA,{label:'P-sales'});
  const body={action:'issue',branchId:FIX.branchA,email:U.invitee.email,role:'technician'};
  assert.equal((await S.api('/api/security',body)).status,403);
  const M3=await session(apps.policyA,U.managerA,{label:'P-manager-issue'});assert.equal((await M3.api('/api/security',body)).status,403);
  assert.equal((await P2.api('/api/security',body)).status,403,'owner without step-up');
  assert.equal((await P2.api('/api/security',{...body,role:'owner'})).status,400,'owner role can never be invited');
  record('B','sales, manager and owner-without-step-up cannot issue; owner role not invitable','policy-simulated',{});
 });
 it('B1/B2 beheerder maakt uitnodiging: 48 uur geldig, token alleen gehasht opgeslagen',T,async()=>{
  P2.lastAuth=await registerAndVerifyExisting(P2);await independentFactorSimulated(policy.db,P2);
  const r=await P2.api('/api/security',{action:'issue',branchId:FIX.branchA,email:U.invitee.email,role:'technician'});
  assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.expiresInSeconds,172800);
  const url=new URL(r.body.acceptURL);assert.equal(url.origin,apps.policyA.origin);assert.equal(url.pathname,'/accept-invitation.html');assert.equal(url.search,'');
  const token=new URLSearchParams(url.hash.slice(1)).get('token');assert.match(token,/^[A-Za-z0-9_-]{43}$/);
  const row=await sql(policy.db,"SELECT token_hash,role,branch_id,round(extract(epoch FROM expires_at-created_at))::int ttl,row_to_json(i)::text AS raw FROM rf_member_invitations i WHERE id=$1",[r.body.id]);
  assert.equal(row[0].token_hash,crypto.createHash('sha256').update(token).digest('hex'));assert.equal(row[0].ttl,172800);assert.equal(row[0].raw.includes(token),false);
  inv={id:r.body.id,token,url:r.body.acceptURL};
  record('B','invitation issued (201), 48h expiry, token only as SHA-256 hash, token in URL fragment','policy-simulated',{});
 });
 it('B3a verkeerde of ongeverifieerde identiteit kan de uitnodiging niet accepteren',T,async()=>{
  const S=await session(apps.policyA,U.salesA,{label:'P-sales-accept'});
  assert.equal((await S.api('/api/security',{action:'accept',token:inv.token})).status,403);
  const r=await P2.api('/api/security',{action:'issue',branchId:FIX.branchA,email:U.unverified.email,role:'technician'});assert.equal(r.status,201);
  const X=await session(apps.policyA,U.unverified,{label:'P-unverified'});
  assert.equal((await X.api('/api/security',{action:'accept',token:new URLSearchParams(new URL(r.body.acceptURL).hash.slice(1)).get('token')})).status,403);
  record('B','other mailbox and unverified mailbox cannot accept','policy-simulated',{});
 });
 it('B3/B7 uitgenodigde accepteert via de echte acceptatiepagina; krijgt uitsluitend de toegewezen rol',T,async()=>{
  const I=await session(apps.policyA,U.invitee,{label:'P-invitee'});
  assert.equal((await I.api('/api/auth/me')).status,403,'no access before acceptance');
  await I.page.goto(inv.url);
  assert.equal(await I.page.evaluate(()=>location.hash),'','token removed from the address bar');
  await I.page.click('#accept');await I.page.waitForFunction(()=>/geaccepteerd/i.test(document.getElementById('status').textContent),null,{timeout:20000});
  await I.screenshot('B3-invitation-accepted-ui');
  assert.deepEqual((await I.api('/api/auth/me')).body,{authenticated:true,role:'technician'});
  assert.equal((await I.api('/api/workspace')).status,403,'technician has no owner/manager workspace access in static mode');
  const staff=await sql(policy.db,'SELECT role,branch_id,active FROM rf_staff WHERE identity_subject=$1',[U.invitee.id]);assert.deepEqual(staff,[{role:'technician',branch_id:FIX.branchA,active:true}]);
  const rights=await sql(policy.db,'SELECT count(*)::int n FROM rf_member_rights r JOIN rf_organization_memberships m ON m.id=r.membership_id WHERE m.identity_subject=$1',[U.invitee.id]);assert.equal(rights[0].n,0);
  I.tokenForReuse=inv.token;inv.invitee=I;
  record('B','accepted in real browser; only the invited role (technician, branch A), no extra rights','policy-simulated',{});
 });
 it('B4 hergebruik van de uitnodiging wordt geweigerd',T,async()=>{
  assert.equal((await inv.invitee.api('/api/security',{action:'accept',token:inv.token})).status,403);
  const accepted=await sql(policy.db,'SELECT accepted_subject FROM rf_member_invitations WHERE id=$1',[inv.id]);assert.equal(accepted[0].accepted_subject,U.invitee.id);
  record('B','second acceptance rejected; one-time','policy-simulated',{});
 });
 it('B5 verlopen en ingetrokken uitnodigingen worden geweigerd',T,async()=>{
  const extra={id:'c1000000-0000-4000-8000-000000000003',email:'invitee.two@e2e.invalid'};
  await sql(policy.db,`INSERT INTO neon_auth."user"(id,email,name,"emailVerified") VALUES($1,$2,'E2E synthetic',true)`,[extra.id,extra.email]);
  const issue=async()=>{const r=await P2.api('/api/security',{action:'issue',branchId:FIX.branchA,email:extra.email,role:'sales'});assert.equal(r.status,201);return {id:r.body.id,token:new URLSearchParams(new URL(r.body.acceptURL).hash.slice(1)).get('token')}};
  const expired=await issue();await sql(policy.db,"UPDATE rf_member_invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
  const E=await session(apps.policyA,extra,{label:'P-invitee-two'});
  assert.equal((await E.api('/api/security',{action:'accept',token:expired.token})).status,403);
  const revoked=await issue();assert.equal((await P2.api('/api/security',{action:'revoke',id:revoked.id,reason:'synthetic revoke invitation'})).status,200);
  assert.equal((await E.api('/api/security',{action:'accept',token:revoked.token})).status,403);
  assert.equal((await E.api('/api/auth/me')).status,403);
  record('B','expired and revoked invitations rejected','policy-simulated',{});
 });
 it('B8/D tenant-overschrijdende uitnodiging: eigenaar van B kan niet uitnodigen voor vestiging van A',T,async()=>{
  const B1=await session(apps.policyB,U.ownerB,{label:'P-ownerB'});await registerAndVerify(B1);await independentFactorSimulated(policy.db,B1);
  assert.equal((await B1.api('/api/security',{action:'issue',branchId:FIX.branchA,email:'cross@e2e.invalid',role:'manager'})).status,403);
  assert.equal((await B1.api('/api/security',revokeBody(U.managerA,null))).status,403,'cannot revoke staff of another tenant');
  record('B','cross-tenant invitation and cross-tenant revocation denied','policy-simulated',{});
 });
});
async function registerAndVerifyExisting(s){
 const has=await sql(s.app.dbx.db,'SELECT count(*)::int n FROM rf_webauthn_credentials WHERE identity_subject=$1',[s.user.id]);
 if(has[0].n){const owner=open.find(o=>o!==s&&o.user===s.user&&o.app===s.app);const [c]=await owner.credentials().catch(()=>[]);if(c)await s.cdp.send('WebAuthn.addCredential',{authenticatorId:s.authenticatorId,credential:c})}
 else{const reg=await s.ceremony('registration');assert.equal(reg.status,200)}
 const a=await s.ceremony('authentication');assert.equal(a.status,200,JSON.stringify(a.body));return a;
}

describe('Scenario C — sessiebeveiliging (strikt)',()=>{
 it('C2/C8 verlopen of te oude sessies geweigerd; uitgelogde sessie geweigerd',T,async()=>{
  const old=await session(apps.strictA,U.managerA,{ageSeconds:12*3600+60,label:'C-too-old'});
  assert.equal((await old.api('/api/workspace')).status,401);assert.equal((await old.api('/api/auth/me')).status,401);
  const s=await session(apps.strictA,U.managerA,{label:'C-logout'});assert.equal((await s.api('/api/workspace')).status,200);
  assert.equal((await s.api('/api/auth/logout',{})).status,200);assert.equal((await s.api('/api/workspace')).status,401);
  const expired=await session(apps.strictA,U.managerA,{label:'C-expired'});await sql(strict.db,"UPDATE neon_auth.session SET \"expiresAt\"=now()-interval '1 second' WHERE id=$1",[expired.session.sessionId]);
  assert.equal((await expired.api('/api/workspace')).status,401);
  record('C','>12h, provider-expired and signed-out sessions rejected','strict',{});
 });
 it('C9 sessie-intrekking via de route is in de huidige policy fail-closed, ook na echte WebAuthn',T,async()=>{
  const O=open.find(o=>o.label==='A-owner-session1');
  assert.equal((await O.api('/api/security',revokeBody(U.managerA,null))).status,403);
  const d=await sql(strict.db,'SELECT count(*)::int n FROM rf_session_denials');assert.equal(d[0].n,0);
  record('C','no revocation possible under the committed policy (fail-closed)','strict',{});
 });
});

describe('Scenario D — tenantisolatie (strikt)',()=>{
 let MA,OB;
 it('D2/D3 lezen en schrijven blijven binnen de eigen tenant',T,async()=>{
  MA=await session(apps.strictA,U.managerA,{label:'D-managerA'});OB=await session(apps.strictB,U.ownerB,{label:'D-ownerB'});
  const name='E2E-D-'+crypto.randomUUID();
  const w=await MA.api('/api/workspace',{action:'customer',requestId:crypto.randomUUID(),type:'individual',name,email:'',phone:'',organizationId:FIX.orgB,branchId:FIX.branchB});
  assert.equal(w.status,201,JSON.stringify(w.body));
  const db=await sql(strict.db,'SELECT organization_id FROM rf_customers WHERE display_name=$1',[name]);assert.deepEqual(db,[{organization_id:FIX.orgA}],'forged body tenant ignored; row stored in A');
  const a=await MA.api('/api/workspace?organizationId='+FIX.orgB);assert.equal(a.body.context.organizationId,FIX.orgA);
  assert.ok(a.body.customers.some(c=>c.display_name===name));assert.ok(a.body.customers.every(c=>c.display_name!=='E2E klant van B'));
  const b=await OB.api('/api/workspace');assert.equal(b.body.context.organizationId,FIX.orgB);
  assert.ok(b.body.customers.every(c=>c.display_name!==name&&c.display_name!=='E2E klant van A'));
  record('D','reads/writes confined to server-side tenant; forged body/query tenant ignored','strict',{});
 });
 it('D4/D5 API-autorisatie: andere tenant en lagere rol geweigerd',T,async()=>{
  const XB=await session(apps.strictA,U.ownerB,{label:'D-ownerB-on-A'});
  assert.equal((await XB.api('/api/auth/me')).status,403);assert.equal((await XB.api('/api/workspace')).status,403);
  assert.equal((await XB.api('/api/workspace',{action:'customer',requestId:crypto.randomUUID(),type:'individual',name:'E2E cross',email:'',phone:''})).status,403);
  const S=await session(apps.strictA,U.salesA,{label:'D-salesA'});assert.equal((await S.api('/api/workspace')).status,403);
  record('D','tenant B owner denied on tenant A; sales role denied workspace in static mode','strict',{});
 });
 it('D7 gemanipuleerde tenantcontext-header geweigerd wanneer dynamische context uit staat',T,async()=>{
  for(const h of [FIX.orgB+':'+FIX.branchB,FIX.orgA+':'+FIX.branchA])assert.equal((await MA.api('/api/workspace',null,{'x-repairflow-context':h})).status,403);
  const c=await MA.api('/api/contexts');assert.deepEqual(c,{status:200,body:{enabled:false,contexts:[]}});
  record('D','x-repairflow-context rejected while dynamic context is disabled','strict',{});
 });
 it('D7b (alleen geïsoleerde testinstantie) dynamische context: vreemde/onbekende context geweigerd',T,async()=>{
  const DM=await session(apps.strictADynamic,U.managerA,{label:'D-dynamic-manager'});
  assert.equal((await DM.api('/api/workspace',null,{'x-repairflow-context':FIX.orgA+':'+FIX.branchA})).status,200);
  assert.equal((await DM.api('/api/workspace',null,{'x-repairflow-context':FIX.orgB+':'+FIX.branchB})).status,403);
  assert.equal((await DM.api('/api/workspace',null,{'x-repairflow-context':FIX.orgA+':'+FIX.branchA2})).status,403);
  const ctx=await DM.api('/api/contexts');assert.equal(ctx.status,200);assert.deepEqual(ctx.body.contexts.map(c=>c.organization_id+':'+c.branch_id),[FIX.orgA+':'+FIX.branchA]);
  const DB=await session(apps.strictADynamic,U.ownerB,{label:'D-dynamic-ownerB'});
  assert.equal((await DB.api('/api/workspace',null,{'x-repairflow-context':FIX.orgA+':'+FIX.branchA})).status,403);
  record('D','dynamic mode (test instance only): foreign and unassigned contexts denied; discovery lists own contexts only','strict',{note:'production flag remains disabled'});
 });
});
