'use strict';
// Browser E2E of the preview-only owner test page (/test-account) — real Chromium
// with Samsung Galaxy S24 DEVICE EMULATION (viewport, touch, mobile user agent; this
// is NOT a real Samsung), the real api/auth/session.js + lib/test-account-login.js,
// real api/auth/me, api/auth/logout and api/workspace handlers, and local PostgreSQL
// with every committed migration.
//
// Substituted and therefore NOT proven here: the real Neon Auth provider (synthetic
// email-OTP / sign-in / session endpoints; codes come from an in-memory outbox that
// stands in for the mailbox), Vercel's runtime and Neon's network. The real provider
// and the live preview are exercised in tests/provider (CI, needs the owner's secret).
const {describe,it,before,after}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {Client}=require('pg');
const {devices}=require('playwright-core');
const {startIsolatedDatabase,FIX}=require('../harness/postgres');
const {createSyntheticNeonAuth}=require('../harness/synthetic-neon-auth');
const {startAppServer}=require('../harness/app-server');
const {launch,ARTIFACTS}=require('../harness/browser');
const USER=FIX.users.managerA;
const PASSWORD_1='Galaxy-test-'+crypto.randomBytes(6).toString('hex'),PASSWORD_2='Second-'+crypto.randomBytes(8).toString('hex');
const SAMSUNG_INTERNET='Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const T={timeout:90000};
let db,auth,app,browserInfo,browser;const contexts=[],evidence=[],secretsSeen=[];
function record(check,detail={}){evidence.push({check,mode:'synthetic-provider, device-emulation',result:'PASS',detail})}
async function sql(q,p){const c=new Client({connectionString:db.ownerUrl});await c.connect();try{return (await c.query(q,p)).rows}finally{await c.end()}}

async function phone(label,{userAgent}={}){
 const ctx=await browser.newContext({...devices['Galaxy S24'],...(userAgent?{userAgent}:{})});contexts.push(ctx);
 const page=await ctx.newPage();const p={ctx,page,label,errors:[],urls:[]};
 page.on('pageerror',e=>p.errors.push(String(e)));// Expected HTTP refusals (401/403/400) are logged by Chrome as resource errors; only
 // script errors count as page errors.
 page.on('console',m=>{if(m.type()==='error'&&!/^Failed to load resource/.test(m.text()))p.errors.push(m.text())});
 page.on('request',r=>{p.urls.push(r.url());secretsSeen.push(r.url())});
 await page.goto(app.origin+'/test-account');
 await page.waitForFunction(()=>!/controleren/.test(document.getElementById('status').textContent));
 p.status=()=>page.textContent('#status');
 p.session=()=>page.evaluate(async()=>(await fetch('/api/auth/session',{cache:'no-store'})).status);
 p.me=()=>page.evaluate(async()=>{const r=await fetch('/api/auth/me',{cache:'no-store'});return {status:r.status,body:await r.json().catch(()=>null)}});
 p.workspace=()=>page.evaluate(async()=>{const r=await fetch('/api/workspace',{cache:'no-store'});return r.status});
 p.until=async re=>{await page.waitForFunction(src=>new RegExp(src).test(document.getElementById('status').textContent),re.source);return p.status()};
 p.signIn=async password=>{await page.fill('#email',USER.email);await page.fill('#password',password);await page.click('#signin');return p.until(/Aangemeld|onjuist|bevestigd|Mislukt|testaccount/)};
 return p;
}
const lastCode=type=>{const m=[...auth.outbox].reverse().find(x=>x.type===type&&x.to===USER.email);assert.ok(m,'code delivered to the stand-in mailbox');return m.code};

before(async()=>{
 db=await startIsolatedDatabase();auth=createSyntheticNeonAuth(db.ownerUrl);
 app=await startAppServer({database:db,auth,organizationId:FIX.orgA,branchId:FIX.branchA,
  testAccount:{emailSha256:crypto.createHash('sha256').update(USER.email).digest('hex'),userId:USER.id}});
 browserInfo=await launch([app.spki]);browser=browserInfo.browser;
});
after(async()=>{
 for(const c of contexts)await c.close().catch(()=>{});
 await browser?.close().catch(()=>{});await app?.close().catch(()=>{});db?.stop();
 fs.mkdirSync(ARTIFACTS,{recursive:true});
 fs.writeFileSync(path.join(ARTIFACTS,'test-account-evidence.json'),JSON.stringify({generatedAt:new Date().toISOString(),browser:browserInfo&&browserInfo.version,
  device:'Chromium with Playwright "Galaxy S24" emulation (not a physical Samsung)',provider:'synthetic Neon Auth responses (NOT real provider E2E)',checks:evidence},null,1));
});

describe('M — mobiele testaccountpagina (Galaxy S24-emulatie, synthetische provider)',()=>{
 let A,B;
 it('M1 omgevingscontrole toont uitsluitend het vastgepinde geïsoleerde doel; pagina past op het scherm',T,async()=>{
  A=await phone('A Samsung Internet',{userAgent:SAMSUNG_INTERNET});
  assert.match(await A.status(),/Klaar om aan te melden/);
  const env=await A.page.textContent('#env');
  for(const t of ['preview','test/p0-webauthn-browser-e2e-recovery','rf_runtime_login','E2E Tenant A',FIX.orgA,'Eén vaste testorganisatie'])assert.ok(env.includes(t),t);
  assert.doesNotMatch(env,/✗/);
  const overflow=await A.page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);assert.ok(overflow<=1,'no horizontal scrolling on the phone viewport ('+overflow+')');
  await A.page.screenshot({path:path.join(ARTIFACTS,'test-account-01-status.png'),fullPage:true});
  record('environment check renders pinned isolated target on a phone viewport',{viewport:devices['Galaxy S24'].viewport,overflow});
 });
 it('M2 wachtwoord instellen met de e-mailcode (officiële OTP-flow), zonder geheimen in URL of respons',T,async()=>{
  await A.page.fill('#email',USER.email);await A.page.click('#send-reset');await A.until(/stuurt Neon Auth nu een code/);
  await A.page.fill('#reset-code','000000');await A.page.fill('#new-password',PASSWORD_1);await A.page.fill('#new-password-2',PASSWORD_1);
  await A.page.click('#reset-form button[type=submit]');assert.match(await A.until(/Code onjuist|Mislukt/),/Code onjuist/);
  await A.page.fill('#reset-code',lastCode('forget-password'));await A.page.fill('#new-password',PASSWORD_1);await A.page.fill('#new-password-2',PASSWORD_1);
  await A.page.click('#reset-form button[type=submit]');assert.match(await A.until(/Wachtwoord ingesteld|Mislukt|onjuist|verlopen/),/Wachtwoord ingesteld/);
  for(const id of ['#new-password','#new-password-2','#reset-code'])assert.equal(await A.page.inputValue(id),'',id+' cleared');
  assert.equal(await A.page.getAttribute('#new-password','type'),'password');assert.equal(await A.page.getAttribute('#reset-code','autocomplete'),'one-time-code');
  record('password set through email OTP; wrong code refused; fields cleared');
 });
 it('M3 aanmelden geeft één HttpOnly first-party cookie en rol manager; werkruimte bereikbaar',T,async()=>{
  assert.match(await A.signIn('wrong-'+PASSWORD_1),/onjuist/);
  assert.equal((await A.ctx.cookies()).length,0,'failed sign-in sets no cookie');
  assert.match(await A.signIn(PASSWORD_1),/^Aangemeld/);
  await A.page.waitForFunction(()=>/manager/.test(document.getElementById('whoami').textContent));
  const cookies=await A.ctx.cookies();assert.equal(cookies.length,1);
  const [c]=cookies;assert.equal(c.name,'__Secure-neon-auth.session_token');assert.equal(c.httpOnly,true);assert.equal(c.secure,true);assert.equal(c.sameSite,'Lax');assert.equal(c.domain,'localhost');
  assert.equal(await A.page.evaluate(()=>document.cookie),'','session cookie not readable by page script');
  assert.equal(await A.page.inputValue('#password'),'');
  assert.deepEqual((await A.me()).body,{authenticated:true,role:'manager'});assert.equal(await A.workspace(),200);
  await A.page.goto(app.origin+'/workspace');await A.page.waitForLoadState('networkidle');
  await A.page.screenshot({path:path.join(ARTIFACTS,'test-account-02-workspace.png'),fullPage:false});
  await A.page.goto(app.origin+'/test-account');await A.until(/Aangemeld/);
  record('first-party HttpOnly Secure SameSite=Lax cookie; /api/auth/me role manager; /api/workspace 200',{cookieExpiresSet:c.expires>0});
 });
 it('M4 twee onafhankelijke sessies: elk ziet zichzelf als huidige; afmelden in B laat A intact',T,async()=>{
  B=await phone('B Chrome');assert.match(await B.signIn(PASSWORD_1),/^Aangemeld/);
  for(const p of [A,B]){await p.page.click('#list');await p.until(/sessie\(s\)/)}
  const rowsA=await A.page.$$eval('#sessions tr',r=>r.map(x=>x.textContent)),rowsB=await B.page.$$eval('#sessions tr',r=>r.map(x=>x.textContent));
  assert.equal(rowsA.length,2);assert.equal(rowsB.length,2);
  assert.match(rowsA[0],/huidige.*Samsung Internet · Android/);assert.match(rowsB[0],/huidige.*Chrome · Android/);
  assert.doesNotMatch(rowsA.join()+rowsB.join(),/192\.0\.2|token/);
  const [ca]=await A.ctx.cookies(),[cb]=await B.ctx.cookies();assert.notEqual(ca.value,cb.value);
  await B.page.click('#logout');await B.until(/Afgemeld/);
  // No cookie any more: the session probe says 401; /api/auth/me fails closed (401/503).
  assert.equal(await B.session(),401);assert.notEqual((await B.me()).status,200);assert.equal((await A.me()).status,200);
  record('two independent browser sessions listed; sign-out in B leaves A signed in');
 });
 it('M5 andere sessies afmelden vanuit A: B moet opnieuw aanmelden, A blijft',T,async()=>{
  assert.match(await B.signIn(PASSWORD_1),/^Aangemeld/);assert.equal((await B.me()).status,200);
  await A.page.click('#revoke-others');await A.until(/andere sessies zijn afgemeld/);
  assert.equal((await B.me()).status,401);assert.equal((await A.me()).status,200);
  record('revoke-other-sessions ends B and keeps A');
 });
 it('M6 ander adres wordt lokaal geweigerd zonder providerverzoek',T,async()=>{
  const before=auth.calls.length;
  await B.page.fill('#email','someone.else@e2e.invalid');await B.page.fill('#password',PASSWORD_1);await B.page.click('#signin');
  assert.match(await B.until(/testaccount|Mislukt/),/niet het vastgelegde testaccount/);
  await B.page.click('#send-reset');assert.match(await B.until(/testaccount|Mislukt/),/niet het vastgelegde testaccount/);
  assert.equal(auth.calls.length,before,'no provider call for a non-pinned address');
  record('non-pinned address refused before any provider call');
 });
 it('M7 nieuw wachtwoord via de e-mailcode beëindigt bestaande sessies; nieuw wachtwoord werkt, oud niet',T,async()=>{
  await B.page.fill('#email',USER.email);await B.page.click('#send-reset');await B.until(/stuurt Neon Auth/);
  await B.page.fill('#reset-code',lastCode('forget-password'));await B.page.fill('#new-password',PASSWORD_2);await B.page.fill('#new-password-2',PASSWORD_2);
  await B.page.click('#reset-form button[type=submit]');await B.until(/Wachtwoord ingesteld/);
  assert.equal((await A.me()).status,401,'session A ended by the password reset');
  assert.match(await B.signIn(PASSWORD_1),/onjuist/);assert.match(await B.signIn(PASSWORD_2),/^Aangemeld/);
  record('password reset revokes existing sessions; only the new password signs in');
 });
 it('M8 onbevestigd e-mailadres: aanmelden geweigerd tot bevestiging met de e-mailcode',T,async()=>{
  await sql('UPDATE neon_auth."user" SET "emailVerified"=false WHERE id=$1',[USER.id]);
  try{
   const C=await phone('C verify');assert.match(await C.signIn(PASSWORD_2),/nog niet bevestigd/);
   assert.equal(await C.page.isVisible('#verify-section'),true);assert.equal((await C.ctx.cookies()).length,0);
   await C.page.click('#send-verify');await C.until(/Bevestigingscode verstuurd/);
   await C.page.fill('#verify-code',lastCode('email-verification'));await C.page.click('#verify-form button');await C.until(/E-mailadres bevestigd/);
   assert.match(await C.signIn(PASSWORD_2),/^Aangemeld/);
   assert.deepEqual(C.errors,[]);
  }finally{await sql('UPDATE neon_auth."user" SET "emailVerified"=true WHERE id=$1',[USER.id])}
  record('unverified address blocked until email OTP verification');
 });
 it('M9 wachtwoorden en codes verschijnen nooit in een URL; geen paginafouten',T,async()=>{
  const codes=auth.outbox.map(x=>x.code);
  for(const url of secretsSeen)for(const secret of [PASSWORD_1,PASSWORD_2,...codes])assert.ok(!url.includes(secret),'secret in URL: '+url);
  assert.deepEqual(A.errors,[]);assert.deepEqual(B.errors,[]);
  record('no password or one-time code in any request URL; no page errors',{requests:secretsSeen.length});
 });
});
