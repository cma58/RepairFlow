'use strict';
// P0 security browser E2E (phase 2) — real Chrome, CDP virtual WebAuthn authenticators,
// real api/ entrypoints + lib/ handlers, real PostgreSQL with ALL committed migrations
// (incl. 013 MFA policy option A). Everything runs STRICT: positive management paths
// use the real operator bootstrap procedure (scripts/mfa-bootstrap-code.js) and real
// owner approval with fingerprint comparison. No factor policy is simulated.
//
// Substituted (and therefore NOT proven here): the real Neon Auth provider and its
// magic-link/password flow (synthetic /get-session), Vercel's runtime, Neon's network.
// See tests/provider/ for the opt-in real-provider suite.
// Missing PostgreSQL or Chrome fails the run (BLOCKED); nothing is silently skipped.
const {describe,it,before,after}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {Client}=require('pg');
const {startIsolatedDatabase,FIX,staffId}=require('../harness/postgres');
const {createSyntheticNeonAuth}=require('../harness/synthetic-neon-auth');
const {startAppServer}=require('../harness/app-server');
const {launch,browserSession,ARTIFACTS}=require('../harness/browser');
const {issueBootstrapCode}=require('../../scripts/mfa-bootstrap-code');
const {fingerprint}=require('../../lib/webauthn-step-up');
const U=FIX.users;
const T={timeout:90000};
let strict,browserInfo,browser;const apps={};const open=[];const evidence=[];
function record(scenario,check,detail={}){evidence.push({scenario,check,mode:'strict',result:'PASS',detail})}
async function sql(q,p){const c=new Client({connectionString:strict.db.ownerUrl});await c.connect();try{return (await c.query(q,p)).rows}finally{await c.end()}}
async function session(app,user,opts){const s=await browserSession(browser,app,app.auth,user,opts);open.push(s);return s}
// The same physical key used on another device/profile. Every copy must carry the
// HIGHEST signature counter seen for that credential, otherwise the server (correctly)
// rejects it as a cloned authenticator (see A13).
const KEYS=new Map();
const b64url=b=>b.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function harvest(s){for(const id of s.authIds||[s.authenticatorId]){let creds=[];try{creds=await s.credentials(id)}catch{continue}
 for(const c of creds){const k=b64url(c.credentialId),prev=KEYS.get(k);if(!prev||c.signCount>=prev.signCount)KEYS.set(k,c)}}}
async function keySession(app,user,label,{only,org=app===apps.B?FIX.orgB:FIX.orgA,...opts}={}){
 for(const o of open)await harvest(o);
 const ids=only?[...KEYS.keys()].filter(k=>only.includes(fingerprint(k))):(await sql(`SELECT c.credential_id FROM rf_webauthn_credentials c WHERE c.identity_subject=$1 AND c.revoked_at IS NULL AND c.blocked_at IS NULL
  AND EXISTS(SELECT 1 FROM rf_webauthn_approvals a WHERE a.credential_id=c.credential_id AND a.organization_id=$2 AND a.revoked_at IS NULL)`,[user.id,org])).map(r=>r.credential_id);
 const s=await session(app,user,{label,...opts,authenticator:{hasResidentKey:true,...(opts.authenticator||{})}});
 for(const k of ids)if(KEYS.has(k))await s.cdp.send('WebAuthn.addCredential',{authenticatorId:s.authenticatorId,credential:KEYS.get(k)});
 return s;
}
async function swapAuthenticator(s,opts={}){await harvest(s);await s.cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId:s.authenticatorId});s.authenticatorId=await s.addAuthenticator(opts);s.authIds=[s.authenticatorId]}
const settled=s=>s.page.waitForFunction(()=>{const t=document.getElementById('status').textContent;return t&&t!=='Bezig…'},null,{timeout:20000}).then(()=>s.page.textContent('#status'));
const operatorCode=(user,{org=FIX.orgA,purpose='bootstrap'}={})=>issueBootstrapCode((q,p)=>sql(q,p).then(rows=>({rows})),{organizationId:org,subject:user.id,operator:'E2E operator, synthetisch',purpose});
async function activateViaUI(s,code){await s.page.fill('#bootstrap-code',code);await s.page.click('#redeem');return settled(s)}
async function registerViaUI(s){await s.page.click('#register');return settled(s)}
const status=async s=>(await s.api('/api/security',{action:'securityStatus'})).body;
const revokeBody=(target,sessionId)=>({action:'revokeSession',targetStaffId:staffId(target),sessionId,reason:'synthetic e2e revocation reason'});
const fpOf=text=>/([0-9A-F]{4}-[0-9A-F]{4})/.exec(text)?.[1];

before(async()=>{
 strict={db:await startIsolatedDatabase()};strict.auth=createSyntheticNeonAuth(strict.db.ownerUrl);
 const mk=async(name,org,branch,dynamicContext=false)=>{apps[name]=await startAppServer({database:strict.db,auth:strict.auth,organizationId:org,branchId:branch,dynamicContext});apps[name].auth=strict.auth};
 await mk('A',FIX.orgA,FIX.branchA);await mk('B',FIX.orgB,FIX.branchB);await mk('ADynamic',FIX.orgA,FIX.branchA,true);
 browserInfo=await launch(Object.values(apps).map(a=>a.spki));browser=browserInfo.browser;
});
after(async()=>{
 for(const s of open)await s.close().catch(()=>{});
 await browser?.close().catch(()=>{});
 for(const a of Object.values(apps))await a.close().catch(()=>{});
 strict?.db.stop();
 fs.mkdirSync(ARTIFACTS,{recursive:true});
 fs.writeFileSync(path.join(ARTIFACTS,'evidence.json'),JSON.stringify({generatedAt:new Date().toISOString(),browser:browserInfo&&{version:browserInfo.version,executablePath:browserInfo.executablePath},node:process.version,
  migrations:strict?.db.applied,provider:'synthetic Neon Auth responses (NOT real provider E2E)',checks:evidence},null,1));
});

// Shared state across scenarios (sequential).
const S={};
describe('A — MFA, passkeys, eerste enrollment en step-up',()=>{
 it('A1 primaire login: geverifieerde sessie en rol, maar geen beheerbevoegdheid',T,async()=>{
  S.O1=await session(apps.A,U.ownerA,{label:'A-owner-1'});
  assert.equal(await S.O1.page.evaluate(()=>window.isSecureContext),true);
  assert.deepEqual((await S.O1.api('/api/auth/session')).body,{authenticated:true,authorized:false,reason:'staff_authorization_pending'});
  assert.deepEqual((await S.O1.api('/api/auth/me')).body,{authenticated:true,role:'owner'});
  const st=await status(S.O1);assert.equal(st.mfaReady,false);assert.deepEqual(st.credentials,[]);assert.equal(st.allowSyncedPasskeys,true,'option A default');
  record('A','primary login verified; no MFA yet; option A policy default');
 });
 it('A2 beheeracties geweigerd zonder tweede factor',T,async()=>{
  assert.deepEqual(await S.O1.api('/api/security',revokeBody(U.managerA,null)),{status:403,body:{error:'step_up_required'}});
  assert.equal((await S.O1.api('/api/security',{action:'issue',branchId:FIX.branchA,email:'x@e2e.invalid',role:'technician'})).status,403);
  assert.deepEqual(await S.O1.api('/api/security',{action:'authenticationOptions',purpose:'session.revoke'}),{status:400,body:{error:'no_credential'}});
  assert.deepEqual(await S.O1.api('/api/security',{action:'authenticationOptions',purpose:'root'}),{status:400,body:{error:'invalid_input'}});
  record('A','management denied after primary-only login; unknown purpose rejected');
 });
 it('A2b registratie vereist een recente primaire login (<5 min)',T,async()=>{
  const stale=await session(apps.A,U.ownerA,{ageSeconds:6*60,label:'A-owner-stale'});
  assert.deepEqual(await stale.api('/api/security',{action:'registrationOptions'}),{status:403,body:{error:'recent_login_required'}});
  record('A','registration refused for primary session older than 5 minutes');
 });
 it('A3 eerste sleutel via de echte UI: geregistreerd maar IN AFWACHTING (niet op basis van primaire login geactiveerd)',T,async()=>{
  const text=await registerViaUI(S.O1);assert.match(text,/geregistreerd.*Nog niet actief/s);await S.O1.screenshot('A3-first-key-pending');
  S.ownerFp=fpOf(text);
  const st=await status(S.O1);assert.deepEqual(st.credentials.map(c=>[c.fingerprint,c.state]),[[S.ownerFp,'pending']]);
  const rows=await sql('SELECT octet_length(public_key) len,user_verified,aaguid FROM rf_webauthn_credentials WHERE identity_subject=$1',[U.ownerA.id]);
  assert.equal(rows.length,1);assert.equal(rows[0].user_verified,true);assert.ok(rows[0].len>=32&&rows[0].len<=4096);
  assert.equal((await sql('SELECT count(*)::int n FROM rf_webauthn_approvals WHERE identity_subject=$1',[U.ownerA.id]))[0].n,0);
  record('A','first key stored as pending; UV recorded; only public key',{coseKeyBytes:rows[0].len,aaguid:rows[0].aaguid});
 });
 it('A3b ongeldige challenge geweigerd: gemanipuleerde challenge en vervalste challengeId',T,async()=>{
  assert.deepEqual((({status,body})=>[status,body])(await S.O1.ceremony('authentication',{tamper:'challenge'})),[400,{verified:false}]);
  assert.deepEqual((({status,body})=>[status,body])(await S.O1.ceremony('authentication',{tamper:'challengeId'})),[400,{error:'invalid_challenge'}]);
  record('A','tampered challenge and forged challengeId rejected');
 });
 it('A4 geldige verificatie met de pending sleutel: cryptografisch OK, maar géén onafhankelijke factor',T,async()=>{
  const r=await S.O1.ceremony('authentication',{purpose:'session.revoke'});
  assert.equal(r.status,200);assert.equal(r.body.verified,true);assert.equal(r.body.independentFactor,false);assert.equal(r.body.purpose,'session.revoke');
  assert.deepEqual(await S.O1.api('/api/security',revokeBody(U.managerA,null)),{status:403,body:{error:'step_up_required'}});
  S.lastO1=r;record('A','pending key verifies but is not independent; management stays denied (fail-closed)');
 });
 it('A5 replay en gelijktijdige dubbele indiening geweigerd; rate limit 5/15 min',T,async()=>{
  assert.deepEqual(await S.O1.replay(S.lastO1.payload),{status:400,body:{error:'invalid_challenge'}});
  const race=await S.O1.page.evaluate(async()=>{const post=b=>fetch('/api/security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
   const o=await (await post({action:'authenticationOptions'})).json();const response=await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:o.options});
   const body={action:'authenticationVerify',challengeId:o.challengeId,response};return (await Promise.all([post(body),post(body),post(body)])).map(r=>r.status).sort()});
  assert.deepEqual(race,[200,400,400]);
  assert.deepEqual(await S.O1.api('/api/security',{action:'authenticationOptions'}),{status:429,body:{error:'rate_limited'}});
  record('A','replay rejected; 3 concurrent submissions → exactly one accepted; 6th challenge → 429',{race});
 });
 it('A5b binding: assertion geweigerd in andere sessie en bij andere gebruiker; verlopen challenge geweigerd',T,async()=>{
  S.O1b=await keySession(apps.A,U.ownerA,'A-owner-1b',{only:[S.ownerFp]});const other=await session(apps.A,U.ownerA,{label:'A-owner-other'});const M=await session(apps.A,U.managerA,{label:'A-manager-replay'});
  const fresh=await S.O1b.page.evaluate(async()=>{const o=await (await fetch('/api/security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'authenticationOptions'})})).json();
   return {action:'authenticationVerify',challengeId:o.challengeId,response:await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:o.options})}});
  assert.deepEqual(await other.replay(fresh),{status:400,body:{error:'invalid_challenge'}});
  assert.deepEqual(await M.replay(fresh),{status:400,body:{error:'invalid_challenge'}});
  await sql("UPDATE rf_webauthn_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[fresh.challengeId]);
  assert.deepEqual(await S.O1b.replay(fresh),{status:400,body:{error:'invalid_challenge'}});
  record('A','challenge bound to session and user; expired challenge rejected');
 });
 it('A6 gestolen verse primaire sessie: kan eigen sleutel enkel PENDING registreren en niet activeren zonder code',T,async()=>{
  S.thief=await session(apps.A,U.ownerA,{label:'A-thief'});
  const text=await registerViaUI(S.thief);assert.match(text,/Nog niet actief/);S.thiefFp=fpOf(text);
  assert.match(await activateViaUI(S.thief,'0000000000000000000000000Z'),/ongeldig, verlopen of al gebruikt/);
  const r=await S.thief.ceremony('authentication',{purpose:'session.revoke'});assert.equal(r.body.independentFactor,false);
  assert.deepEqual(await S.thief.api('/api/security',revokeBody(U.managerA,null)),{status:403,body:{error:'step_up_required'}});
  record('A','stolen fresh session: attacker key stays pending; no activation without out-of-band code; management denied');
 });
 it('A7 eerste-beheerder-bootstrap: eenmalige operatorcode + bezit van de nieuwe sleutel activeert precies die sleutel',T,async()=>{
  const code=await operatorCode(U.ownerA);
  S.O2=await keySession(apps.A,U.ownerA,'A-owner-2',{only:[S.ownerFp]});
  const text=await activateViaUI(S.O2,code.code);await S.O2.screenshot('A7-bootstrap-activated');
  assert.match(text,new RegExp('Sleutel '+S.ownerFp+' geactiveerd'));
  const st=await status(S.O2);const byFp=Object.fromEntries(st.credentials.map(c=>[c.fingerprint,c]));
  assert.equal(byFp[S.ownerFp].state,'active');assert.equal(byFp[S.ownerFp].approvalMethod,'bootstrap');assert.equal(byFp[S.thiefFp].state,'pending','the attacker key is NOT activated by the owner\'s code');
  assert.equal(st.mfaReady,true);
  const S2=await keySession(apps.A,U.ownerA,'A-owner-2b',{only:[S.ownerFp]});
  assert.match(await activateViaUI(S2,code.code),/ongeldig|niet toegestaan|Bevestig eerst/i,'code is single-use');
  const events=await sql("SELECT action FROM rf_security_events WHERE identity_subject=$1 AND action LIKE 'mfa.bootstrap.%' ORDER BY created_at",[U.ownerA.id]);
  assert.ok(events.some(e=>e.action==='mfa.bootstrap.redeemed')&&events.some(e=>e.action==='mfa.bootstrap.rejected'));
  record('A','bootstrap code activates only the key proven in that session; single-use; audited');
 });
 it('A8 beheeractie toegestaan na onafhankelijke step-up; doelgebonden en eenmalig',T,async()=>{
  const S3=await keySession(apps.A,U.ownerA,'A-owner-3');
  assert.equal((await S3.stepUp('invitation.manage')).independentFactor,true);
  assert.deepEqual(await S3.api('/api/security',revokeBody(U.salesA,crypto.randomUUID())),{status:403,body:{error:'step_up_required'}},'wrong purpose');
  assert.equal((await S3.stepUp('session.revoke')).independentFactor,true);
  const ok=await S3.api('/api/security',revokeBody(U.salesA,crypto.randomUUID()));assert.equal(ok.status,200);assert.equal(ok.body.scope,'organization_only');
  assert.deepEqual(await S3.api('/api/security',revokeBody(U.salesA,crypto.randomUUID())),{status:403,body:{error:'step_up_required'}},'single-use');
  S.O3=S3;record('A','independent step-up allows exactly one action of the declared purpose');
 });
 it('A9 verlopen MFA-status geweigerd',T,async()=>{
  assert.equal((await S.O3.stepUp('session.revoke')).independentFactor,true);
  await sql("UPDATE rf_webauthn_grants SET expires_at=now()-interval '1 second' WHERE session_id=$1",[S.O3.session.sessionId]);
  assert.deepEqual(await S.O3.api('/api/security',revokeBody(U.salesA,null)),{status:403,body:{error:'step_up_required'}});
  record('A','expired step-up denied');
 });
 it('A10 F2: met een actieve sleutel vereist een extra sleutel step-up; daarna direct actief',T,async()=>{
  const S4=await keySession(apps.A,U.ownerA,'A-owner-4');
  assert.deepEqual(await S4.api('/api/security',{action:'registrationOptions'}),{status:403,body:{error:'step_up_required'}});
  assert.match(await registerViaUI(S4),/Bevestig eerst/);await S4.screenshot('A10-step-up-required-ui');
  await S4.stepUp('credential.manage');
  await swapAuthenticator(S4);
  const text=await registerViaUI(S4);assert.match(text,/Extra sleutel geregistreerd en actief/);S.secondFp=fpOf(text);
  S.O4=S4;record('A','additional key requires step-up with an approved key and is then approved via step_up');
 });
 it('A11 ontbrekende user verification geweigerd (registratie en verificatie)',T,async()=>{
  const S5=await keySession(apps.A,U.ownerA,'A-owner-noUV');
  await S5.cdp.send('WebAuthn.setUserVerified',{authenticatorId:S5.authenticatorId,isUserVerified:false});
  const r=await S5.ceremony('authentication',{tamper:'uv',purpose:'session.revoke'});
  assert.deepEqual([r.status,r.body],[400,{verified:false}]);
  const reg=await session(apps.A,U.managerA,{label:'A-manager-noUV',authenticator:{hasUserVerification:false,isUserVerified:false}});
  const rr=await reg.ceremony('registration',{tamper:'uv'});assert.deepEqual([rr.status,rr.body],[400,{verified:false}]);
  assert.equal((await sql('SELECT count(*)::int n FROM rf_webauthn_credentials WHERE identity_subject=$1',[U.managerA.id]))[0].n,0);
  record('A','assertion and registration without UV rejected server-side despite client downgrade');
 });
 it('A12 onbekende (aanvallers)sleutel intrekken via de UI na step-up',T,async()=>{
  const S6=await keySession(apps.A,U.ownerA,'A-owner-revoke');
  await S6.page.fill('#own-fingerprint',S.thiefFp);await S6.page.fill('#own-reason','onbekende sleutel van gestolen sessie');await S6.page.click('#revoke-key');
  assert.equal(await settled(S6),'Sleutel ingetrokken.');
  assert.equal((await status(S6)).credentials.find(c=>c.fingerprint===S.thiefFp).state,'revoked');
  const [thiefCred]=await S.thief.credentials();
  const forced=await S.thief.ceremony('authentication',{purpose:'session.revoke',allow:[b64url(thiefCred.credentialId)]});
  assert.deepEqual([forced.status,forced.body],[400,{verified:false}],'server rejects a signature from the revoked key');
  S.O6=S6;record('A','pending attacker key revoked by owner after step-up; unusable afterwards');
 });
 it('A13 credential counter: gekloonde authenticator geweigerd',T,async()=>{
  const clone=await session(apps.A,U.ownerA,{label:'A-owner-clone'});
  const [cred]=await S.O1.credentials();await clone.cdp.send('WebAuthn.addCredential',{authenticatorId:clone.authenticatorId,credential:cred});
  const r=await clone.ceremony('authentication',{purpose:'session.revoke'});assert.deepEqual([r.status,r.body],[400,{verified:false}]);
  record('A','stale copy of a key (lower signature counter) rejected as clone');
 });
 it('A14 beleid gesynchroniseerde passkeys: uitgeschakeld → gesynchroniseerde passkey geen onafhankelijke factor',T,async()=>{
  const S7=await keySession(apps.A,U.ownerA,'A-owner-synced',{only:[S.secondFp]});
  await S7.stepUp('credential.manage');
  await swapAuthenticator(S7,{transport:'internal',hasResidentKey:true,defaultBackupEligibility:true,defaultBackupState:true});
  const text=await registerViaUI(S7);assert.match(text,/actief/);const syncedFp=fpOf(text);
  assert.equal((await status(S7)).credentials.find(c=>c.fingerprint===syncedFp).synced,true);
  const P=await keySession(apps.A,U.ownerA,'A-owner-policy',{only:[S.secondFp]});
  await P.page.waitForSelector('#admin:not([hidden])');await P.page.uncheck('#allow-synced');await P.page.click('#save-policy');
  assert.match(await settled(P),/Alleen apparaatgebonden/);
  await harvest(S7);const Q=await keySession(apps.A,U.ownerA,'A-owner-synced-2',{only:[syncedFp]});
  assert.equal((await Q.stepUp('session.revoke')).independentFactor,false,'synced passkey not independent under strict policy');
  const D=await keySession(apps.A,U.ownerA,'A-owner-device',{only:[S.secondFp]});
  assert.equal((await D.stepUp('policy.manage')).independentFactor,true,'device-bound key still independent');
  assert.equal((await D.api('/api/security',{action:'setSecurityPolicy',allowSyncedPasskeys:true})).status,200);
  record('A','synced-passkey policy enforced by the database; restorable only with step-up');
 });
});

describe('A/R — sleutel van medewerker goedkeuren, verlies, blokkeren en herstel',()=>{
 it('R1 manager registreert sleutel (pending); eigenaar keurt goed na vingerafdrukvergelijking via admin-UI',T,async()=>{
  S.M1=await session(apps.A,U.managerA,{label:'R-manager-1'});
  const text=await registerViaUI(S.M1);S.mFp=fpOf(text);assert.match(text,/Nog niet actief/);
  const O=await keySession(apps.A,U.ownerA,'R-owner-approve');
  await O.page.waitForSelector('#admin:not([hidden])');
  await O.page.selectOption('#member',staffId(U.managerA));await O.page.fill('#member-fingerprint','0000-0000');await O.page.click('#approve-key');
  assert.match(await settled(O),/niet toegestaan/,'wrong fingerprint refused');
  await O.page.fill('#member-fingerprint',S.mFp);await O.page.click('#approve-key');
  assert.equal(await settled(O),'Sleutel goedgekeurd.');await O.screenshot('R1-admin-approved');
  assert.equal((await S.M1.stepUp('credential.manage')).independentFactor,true);
  assert.equal((await S.M1.api('/api/security',{action:'approveCredential',targetStaffId:staffId(U.ownerA),fingerprint:S.ownerFp})).status,403,'manager cannot approve');
  record('R','admin approval with in-person fingerprint check; wrong fingerprint refused; managers cannot approve');
 });
 it('R2 verloren sleutel: blokkeren zonder sleutel (verse login) beëindigt alle sessies',T,async()=>{
  const M2=await session(apps.A,U.managerA,{label:'R-manager-2'});
  await M2.page.fill('#own-fingerprint',S.mFp);await M2.page.fill('#own-reason','telefoon met passkey verloren');await M2.page.click('#block-key');
  assert.match(await settled(M2),/Sleutel geblokkeerd. Alle sessies zijn beëindigd/);
  for(const s of [S.M1,M2])assert.equal((await s.api('/api/workspace')).status,403);
  const stale=await session(apps.A,U.managerA,{ageSeconds:11*60,label:'R-manager-stale'});
  assert.equal((await stale.api('/api/security',{action:'blockCredential',fingerprint:S.mFp,reason:'poging met oude sessie'})).status,403);
  record('R','self-block needs a fresh login, ends every session in the tenant');
 });
 it('R3 herstel: nieuwe sleutel blijft pending tot nieuwe goedkeuring; oude sleutel onbruikbaar',T,async()=>{
  await new Promise(r=>setTimeout(r,1100));
  const M3=await session(apps.A,U.managerA,{label:'R-manager-3'});
  assert.equal((await M3.api('/api/workspace')).status,200,'new login after revocation works');
  const old=await keySession(apps.A,U.managerA,'R-manager-oldkey',{only:[S.mFp]});
  assert.deepEqual(await old.api('/api/security',{action:'authenticationOptions'}),{status:400,body:{error:'no_credential'}},'blocked key not offered');
  const text=await registerViaUI(M3);const newFp=fpOf(text);assert.match(text,/Nog niet actief/);
  assert.equal((await M3.stepUp('credential.manage')).independentFactor,false,'recovery cannot bypass approval');
  const O=await keySession(apps.A,U.ownerA,'R-owner-reapprove');
  await O.stepUp('credential.approve');
  assert.equal((await O.api('/api/security',{action:'approveCredential',targetStaffId:staffId(U.managerA),fingerprint:newFp})).status,200);
  const M4=await keySession(apps.A,U.managerA,'R-manager-4');
  assert.equal((await M4.stepUp('credential.manage')).independentFactor,true);
  const st=await status(M4);assert.deepEqual(st.credentials.map(c=>c.state).sort(),['active','blocked']);
  record('R','recovery: new key pending until owner approval; blocked key never offered or accepted');
 });
 it('R4 alleen-beheerder herstel via operator-herstelcode (break-glass)',T,async()=>{
  const B1=await session(apps.B,U.ownerB,{label:'R-ownerB-1'});
  assert.match(await registerViaUI(B1),/Nog niet actief/);
  const code=await operatorCode(U.ownerB,{org:FIX.orgB,purpose:'recovery'});
  assert.match(await activateViaUI(B1,code.code),/geactiveerd/);
  const B2=await keySession(apps.B,U.ownerB,'R-ownerB-2');assert.equal((await B2.stepUp('session.revoke')).independentFactor,true);
  record('R','sole admin recovery only via one-time operator code, still bound to key possession');
 });
});

describe('B — sessies (twee onafhankelijke browserprofielen)',()=>{
 it('B1 dezelfde gebruiker in twee profielen heeft twee sessies',T,async()=>{
  S.P1=await session(apps.A,U.salesA,{label:'B-sales-1'});S.P2=await session(apps.A,U.salesA,{label:'B-sales-2'});
  assert.notEqual(S.P1.session.sessionId,S.P2.session.sessionId);
  for(const s of [S.P1,S.P2])assert.deepEqual((await s.api('/api/auth/me')).body,{authenticated:true,role:'sales'});
  record('B','two independent browser contexts, two provider sessions');
 });
 it('B2 één sessie intrekken: server-side geweigerd, andere sessie werkt',T,async()=>{
  const O=await keySession(apps.A,U.ownerA,'B-owner-revoke1');await O.stepUp('session.revoke');
  assert.equal((await O.api('/api/security',revokeBody(U.salesA,S.P1.session.sessionId))).status,200);
  assert.equal((await S.P1.api('/api/auth/me')).status,403);assert.deepEqual((await S.P2.api('/api/auth/me')).body,{authenticated:true,role:'sales'});
  record('B','single-session revocation enforced; sibling session unaffected');
 });
 it('B3 alle sessies intrekken; nieuwe login daarna toegestaan',T,async()=>{
  const O=await keySession(apps.A,U.ownerA,'B-owner-revokeall');await O.stepUp('session.revoke');
  assert.equal((await O.api('/api/security',revokeBody(U.salesA,null))).status,200);
  assert.equal((await S.P2.api('/api/auth/me')).status,403);
  await new Promise(r=>setTimeout(r,1100));
  const P3=await session(apps.A,U.salesA,{label:'B-sales-3'});assert.equal((await P3.api('/api/auth/me')).status,200);
  record('B','revoke-all denies existing sessions; new login works');
 });
 it('B4 oude cookies: uitgelogd, provider-verlopen en >12 uur oud geweigerd',T,async()=>{
  const s=await session(apps.A,U.managerA,{label:'B-logout'});assert.equal((await s.api('/api/workspace')).status,200);
  const cookie=(await s.ctx.cookies())[0];
  assert.deepEqual(await s.api('/api/auth/logout',{}),{status:200,body:{signedOut:true}});
  assert.equal((await s.api('/api/workspace')).status,401);
  const replay=await browser.newContext();await replay.addCookies([cookie]);const pg=await replay.newPage();await pg.goto(apps.A.origin+'/security');
  assert.equal(await pg.evaluate(async()=>(await fetch('/api/workspace')).status),401,'old cookie replayed in a new profile');await replay.close();
  const exp=await session(apps.A,U.managerA,{label:'B-expired'});await sql('UPDATE neon_auth.session SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1',[exp.session.sessionId]);
  assert.equal((await exp.api('/api/workspace')).status,401);
  const old=await session(apps.A,U.managerA,{ageSeconds:12*3600+60,label:'B-too-old'});assert.equal((await old.api('/api/auth/me')).status,401);
  record('B','signed-out cookie (also replayed in another profile), expired and >12h sessions rejected');
 });
 it('B5 MFA-status niet overdraagbaar naar andere sessie of na uitloggen',T,async()=>{
  const O=await keySession(apps.A,U.ownerA,'B-owner-portable');await O.stepUp('session.revoke');
  const other=await session(apps.A,U.ownerA,{label:'B-owner-nostepup'});
  assert.deepEqual(await other.api('/api/security',revokeBody(U.salesA,null)),{status:403,body:{error:'step_up_required'}});
  assert.equal((await O.api('/api/auth/logout',{})).status,200);assert.equal((await O.api('/api/security',revokeBody(U.salesA,null))).status,401);
  record('B','step-up bound to its session; ends with logout');
 });
});

describe('C — uitnodigingen',()=>{
 const issue=async(body)=>{const O=await keySession(apps.A,U.ownerA,'C-owner-'+crypto.randomUUID().slice(0,6));await O.stepUp('invitation.manage');return {O,r:await O.api('/api/security',{action:'issue',branchId:FIX.branchA,role:'technician',...body})}};
 const tokenOf=r=>new URLSearchParams(new URL(r.body.acceptURL).hash.slice(1)).get('token');
 it('C1 onbevoegde uitgifte geweigerd; eigenaarsrol niet uitnodigbaar',T,async()=>{
  const body={action:'issue',branchId:FIX.branchA,email:U.invitee.email,role:'technician'};
  assert.equal((await (await session(apps.A,U.salesA,{label:'C-sales'})).api('/api/security',body)).status,403);
  const M=await keySession(apps.A,U.managerA,'C-manager');await M.stepUp('invitation.manage');
  assert.equal((await M.api('/api/security',body)).status,403,'manager with step-up still not allowed');
  assert.equal((await (await session(apps.A,U.ownerA,{label:'C-owner-nostep'})).api('/api/security',body)).status,403);
  const {r}=await issue({email:U.invitee.email,role:'owner'});assert.equal(r.status,400);
  record('C','sales, manager (even with step-up) and owner without step-up cannot issue; owner role not invitable');
 });
 it('C2 geldige uitnodiging: 48 uur, token alleen gehasht, token in fragment',T,async()=>{
  const {r}=await issue({email:U.invitee.email});assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.expiresInSeconds,172800);
  const t=tokenOf(r);const row=await sql("SELECT token_hash,round(extract(epoch FROM expires_at-created_at))::int ttl,row_to_json(i)::text raw FROM rf_member_invitations i WHERE id=$1",[r.body.id]);
  assert.equal(row[0].token_hash,crypto.createHash('sha256').update(t).digest('hex'));assert.equal(row[0].ttl,172800);assert.equal(row[0].raw.includes(t),false);
  S.inv={id:r.body.id,token:t,url:r.body.acceptURL};record('C','issued with independent single-use step-up; 48h; hashed token');
 });
 it('C3 verkeerde of ongeverifieerde identiteit kan niet accepteren',T,async()=>{
  assert.equal((await (await session(apps.A,U.salesA,{label:'C-wrong'})).api('/api/security',{action:'accept',token:S.inv.token})).status,403);
  const {r}=await issue({email:U.unverified.email});
  assert.equal((await (await session(apps.A,U.unverified,{label:'C-unverified'})).api('/api/security',{action:'accept',token:tokenOf(r)})).status,403);
  record('C','other and unverified mailbox cannot accept');
 });
 it('C4 acceptatie via de echte pagina in de echte database; uitsluitend de toegewezen rol',T,async()=>{
  const I=await session(apps.A,U.invitee,{label:'C-invitee'});
  assert.equal((await I.api('/api/auth/me')).status,403);
  await I.page.goto(S.inv.url);assert.equal(await I.page.evaluate(()=>location.hash),'');
  await I.page.click('#accept');await I.page.waitForFunction(()=>/geaccepteerd/i.test(document.getElementById('status').textContent),null,{timeout:20000});await I.screenshot('C4-invitation-accepted');
  assert.deepEqual((await I.api('/api/auth/me')).body,{authenticated:true,role:'technician'});
  assert.equal((await I.api('/api/workspace')).status,403);assert.equal((await I.api('/api/security',{action:'securityStatus'})).status,403,'technician has no security management');
  assert.deepEqual(await sql('SELECT role,branch_id FROM rf_staff WHERE identity_subject=$1',[U.invitee.id]),[{role:'technician',branch_id:FIX.branchA}]);
  assert.equal((await I.api('/api/security',{action:'accept',token:S.inv.token})).status,403,'reuse');
  record('C','accepted in real browser; only invited role; one-time');
 });
 it('C5 verlopen en ingetrokken uitnodigingen geweigerd (intrekken vereist nieuwe step-up)',T,async()=>{
  const extra={id:'c1000000-0000-4000-8000-000000000003',email:'invitee.two@e2e.invalid'};
  await sql(`INSERT INTO neon_auth."user"(id,email,name,"emailVerified") VALUES($1,$2,'E2E synthetic',true)`,[extra.id,extra.email]);
  const a=await issue({email:extra.email,role:'sales'});await sql("UPDATE rf_member_invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[a.r.body.id]);
  const E=await session(apps.A,extra,{label:'C-invitee-two'});
  assert.equal((await E.api('/api/security',{action:'accept',token:tokenOf(a.r)})).status,403);
  const b=await issue({email:extra.email,role:'sales'});
  assert.deepEqual(await b.O.api('/api/security',{action:'revoke',id:b.r.body.id,reason:'synthetic revoke invitation'}),{status:403,body:{error:'step_up_required'}},'step-up was consumed by the issue');
  await b.O.stepUp('invitation.manage');assert.equal((await b.O.api('/api/security',{action:'revoke',id:b.r.body.id,reason:'synthetic revoke invitation'})).status,200);
  assert.equal((await E.api('/api/security',{action:'accept',token:tokenOf(b.r)})).status,403);
  record('C','expired and revoked invitations rejected; each management action needs its own step-up');
 });
 it('C6 andere organisatie: eigenaar B kan niet uitnodigen voor A of A-sessies intrekken',T,async()=>{
  const B=await keySession(apps.B,U.ownerB,'C-ownerB');await B.stepUp('invitation.manage');
  assert.equal((await B.api('/api/security',{action:'issue',branchId:FIX.branchA,email:'cross@e2e.invalid',role:'manager'})).status,403);
  await B.stepUp('session.revoke');assert.equal((await B.api('/api/security',revokeBody(U.managerA,null))).status,403);
  record('C','cross-tenant invitation and revocation denied');
 });
});

describe('D — tenantisolatie',()=>{
 it('D1 lezen/schrijven binnen eigen tenant; gemanipuleerde tenant-ID genegeerd',T,async()=>{
  const MA=await session(apps.A,U.managerA,{label:'D-managerA'}),OB=await session(apps.B,U.ownerB,{label:'D-ownerB'});
  const name='E2E-D-'+crypto.randomUUID();
  const w=await MA.api('/api/workspace',{action:'customer',requestId:crypto.randomUUID(),type:'individual',name,email:'',phone:'',organizationId:FIX.orgB,branchId:FIX.branchB});assert.equal(w.status,201);
  assert.deepEqual(await sql('SELECT organization_id FROM rf_customers WHERE display_name=$1',[name]),[{organization_id:FIX.orgA}]);
  const a=await MA.api('/api/workspace?organizationId='+FIX.orgB);assert.equal(a.body.context.organizationId,FIX.orgA);assert.ok(a.body.customers.every(c=>c.display_name!=='E2E klant van B'));
  const b=await OB.api('/api/workspace');assert.ok(b.body.customers.every(c=>c.display_name!==name&&c.display_name!=='E2E klant van A'));
  S.MA=MA;record('D','reads/writes confined to server tenant; forged tenant ignored');
 });
 it('D2 andere tenant en lagere rol geweigerd; contextheader geweigerd zolang dynamische context uit staat',T,async()=>{
  const XB=await session(apps.A,U.ownerB,{label:'D-ownerB-on-A'});
  assert.equal((await XB.api('/api/auth/me')).status,403);assert.equal((await XB.api('/api/workspace')).status,403);
  assert.equal((await XB.api('/api/security',{action:'securityStatus'})).status,403);
  assert.equal((await (await session(apps.A,U.salesA,{label:'D-sales'})).api('/api/workspace')).status,403);
  for(const h of [FIX.orgB+':'+FIX.branchB,FIX.orgA+':'+FIX.branchA])assert.equal((await S.MA.api('/api/workspace',null,{'x-repairflow-context':h})).status,403);
  record('D','foreign tenant, lower role and context header denied');
 });
 it('D3 sleutels en sessies van andere tenants niet zichtbaar of beheerbaar',T,async()=>{
  const OB=await keySession(apps.B,U.ownerB,'D-ownerB-keys');
  const st=await status(OB);assert.ok(st.members.every(m=>m.staffId===staffId(U.ownerB)),'tenant B overview lists only tenant B admins');
  await OB.stepUp('credential.approve');
  assert.equal((await OB.api('/api/security',{action:'revokeMemberCredential',targetStaffId:staffId(U.managerA),fingerprint:S.mFp,reason:'cross-tenant attempt test'})).status,403);
  record('D','no cross-tenant visibility or management of keys');
 });
 it('D4 (alleen geïsoleerde testinstantie) dynamische context: vreemde/niet-toegewezen context geweigerd',T,async()=>{
  const DM=await session(apps.ADynamic,U.managerA,{label:'D-dynamic-manager'});
  assert.equal((await DM.api('/api/workspace',null,{'x-repairflow-context':FIX.orgA+':'+FIX.branchA})).status,200);
  assert.equal((await DM.api('/api/workspace',null,{'x-repairflow-context':FIX.orgB+':'+FIX.branchB})).status,403);
  assert.equal((await DM.api('/api/workspace',null,{'x-repairflow-context':FIX.orgA+':'+FIX.branchA2})).status,403);
  record('D','dynamic mode (test instance only): foreign and unassigned contexts denied',{note:'production flag remains disabled'});
 });
});
