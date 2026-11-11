'use strict';
// REAL Neon Auth provider E2E (opt-in). Never runs against mocks; without the
// required configuration the run FAILS as BLOCKED (it is never skipped or green).
//
// Target: the reviewed ISOLATED Neon branch, its Neon Auth instance and the pinned
// Vercel preview (lib/isolated-test-target.js). Identity: the owner-confirmed test
// account, pinned by Neon Auth user ID and e-mail SHA-256; role manager in the
// synthetic organisation only. Never production.
// Required secrets (GitHub environment neon-auth-e2e, settable from a phone browser):
//   PHIXAR_E2E_USER_EMAIL     the owner's test-account address (checked against the pin)
//   PHIXAR_E2E_USER_PASSWORD  the password the owner set himself via the e-mail code
// Required for P7/P8 (live preview chain), repository secret:
//   PHIXAR_E2E_VERCEL_BYPASS  Vercel "Protection Bypass for Automation" of this project
// NOTE: P5 revokes ALL provider sessions of the test account (also on the phone).
// Tokens, cookies, passwords and the address are never printed; evidence.json holds
// only shapes, flags and status codes.
const {describe,it,before,after}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {verifySession,authUrl}=require('../../lib/neon-auth-session');
const {assertIsolatedTarget,pinnedProviderEnv,USER_ID,ORIGIN}=require('./isolated-target');
const E=pinnedProviderEnv(process.env);const evidence=[];const OUT=path.resolve(__dirname,'..','..','test-results','provider-e2e');
const REQUIRED=['PHIXAR_E2E_USER_EMAIL','PHIXAR_E2E_USER_PASSWORD'];
const BYPASS=process.env.PHIXAR_E2E_VERCEL_BYPASS;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const T={timeout:60000};let AUTH,env;
function record(check,detail={}){evidence.push({check,mode:'real-provider',result:'PASS',detail})}

before(()=>{
 const missing=REQUIRED.filter(k=>!E[k]);
 if(missing.length)throw Object.assign(Error('BLOCKED: real Neon Auth provider configuration missing: '+missing.join(', ')),{code:'BLOCKED'});
 if(E.PHIXAR_E2E_ENVIRONMENT!=='isolated')throw Error('BLOCKED: PHIXAR_E2E_ENVIRONMENT must be "isolated"');
 assertIsolatedTarget(E);
 env={REPAIRFLOW_NEON_AUTH_URL:E.PHIXAR_E2E_NEON_AUTH_URL};AUTH=authUrl(env);
});
after(()=>{fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify({generatedAt:new Date().toISOString(),authHost:AUTH&&new URL(AUTH).host,checks:evidence},null,1))});

function parseSetCookie(lines){
 const session=lines.map(l=>l.split(';').map(x=>x.trim())).find(([nv])=>/(?:^|\.)session_token=/.test(nv.split('=')[0]+'='));
 if(!session)return null;
 const [nv,...attrs]=session;const i=nv.indexOf('=');
 const a=Object.fromEntries(attrs.map(x=>{const j=x.indexOf('=');return j<0?[x.toLowerCase(),true]:[x.slice(0,j).toLowerCase(),x.slice(j+1)]}));
 return {name:nv.slice(0,i),value:nv.slice(i+1),attrs:a,cookie:nv};
}
async function signIn(){
 const r=await fetch(AUTH+'/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:E.PHIXAR_E2E_TRUSTED_ORIGIN},
  body:JSON.stringify({email:E.PHIXAR_E2E_USER_EMAIL,password:E.PHIXAR_E2E_USER_PASSWORD}),signal:AbortSignal.timeout(10000)});
 const body=await r.json().catch(()=>null);
 assert.equal(r.status,200,'sign-in status '+r.status);
 const c=parseSetCookie(r.headers.getSetCookie());assert.ok(c,'provider set a session cookie');
 return {cookie:c,userId:body?.user?.id};
}
async function post(pathname,cookie){
 const r=await fetch(AUTH+pathname,{method:'POST',headers:{'Content-Type':'application/json',Origin:E.PHIXAR_E2E_TRUSTED_ORIGIN,Cookie:cookie},body:'{}',signal:AbortSignal.timeout(10000)});
 return r.status;
}
const valid=cookie=>verifySession(cookie,{env}).then(()=>true,()=>false);

describe('Echte Neon Auth-provider (geïsoleerde branch, synthetische gebruiker)',()=>{
 const S={};
 it('P1 e-mail/wachtwoord-login levert een veilige sessiecookie',T,async()=>{
  S.a=await signIn();const {name,attrs}=S.a.cookie;
  assert.match(name,/^(__Secure-|__Host-)?(better-auth|neon-auth)\.session_token$/);
  assert.equal(attrs.secure,true);assert.equal(attrs.httponly,true);assert.match(String(attrs.samesite||''),/^(lax|strict|none)$/i);assert.equal(attrs.path,'/');
  record('sign-in with email/password sets session cookie',{cookieName:name,secure:true,httpOnly:true,sameSite:attrs.samesite,hasExpiry:!!(attrs['max-age']||attrs.expires)});
 });
 it('P2 RepairFlow verifySession accepteert de echte sessie (ID, subject, tijden)',T,async()=>{
  const id=await verifySession(S.a.cookie.cookie,{env});
  assert.match(id.sessionId,UUID);assert.equal(id.subject,USER_ID,'pinned Neon Auth user');assert.equal(S.a.userId,USER_ID);
  assert.ok(Math.abs(Date.now()-Date.parse(id.createdAt))<120000,'fresh createdAt');
  S.a.identity=id;record('real /get-session accepted by verifySession',{sessionIdIsUuid:true,createdAtFresh:true});
 });
 it('P3 twee onafhankelijke logins = twee sessies',T,async()=>{
  S.b=await signIn();S.b.identity=await verifySession(S.b.cookie.cookie,{env});
  assert.notEqual(S.a.identity.sessionId,S.b.identity.sessionId);record('two sign-ins produce two provider sessions');
 });
 it('P3-browser twee onafhankelijke Chrome-profielen ontvangen gescheiden echte provider-sessies',T,async()=>{
  const {chromium}=require('playwright-core');
  const {chromePath}=require('../harness/browser');
  const executablePath=chromePath();assert.ok(executablePath,'Chrome/Chromium required for real provider E2E');
  const browser=await chromium.launch({executablePath,headless:true});
  const contexts=[];
  try{
   const identities=[];
   for(let i=0;i<2;i++){
    const context=await browser.newContext();contexts.push(context);
    const page=await context.newPage();
    // The page is on the isolated Auth origin. Each BrowserContext owns its own
    // cookies and storage; no synthetic cookie or provider response is injected.
    await page.goto(AUTH+'/get-session',{waitUntil:'domcontentloaded'});
    const result=await page.evaluate(async({auth,email,password})=>{
     const signedIn=await fetch(auth+'/sign-in/email',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
     if(!signedIn.ok)return {status:signedIn.status};
     const current=await fetch(auth+'/get-session',{credentials:'include',headers:{Accept:'application/json'}});
     const data=await current.json().catch(()=>null);
     return {status:current.status,sessionId:data?.session?.id,subject:data?.user?.id};
    },{auth:AUTH,email:E.PHIXAR_E2E_USER_EMAIL,password:E.PHIXAR_E2E_USER_PASSWORD});
    assert.equal(result.status,200,'browser provider login/session status');
    assert.match(result.sessionId||'',UUID);assert.ok(result.subject);
    const cookies=await context.cookies(AUTH);
    assert.ok(cookies.some(c=>/(?:better-auth|neon-auth)\.session_token$/.test(c.name)&&c.httpOnly&&c.secure),'browser stores secure HttpOnly session cookie');
    identities.push(result);
   }
   assert.equal(identities[0].subject,identities[1].subject);
   assert.notEqual(identities[0].sessionId,identities[1].sessionId);
   record('two independent Chrome BrowserContexts authenticate against real Neon Auth',{distinctSessionIds:true,separateCookieStores:true});
  }finally{await Promise.allSettled(contexts.map(c=>c.close()));await browser.close()}
 });
 it('P3b sessiegeldigheid: vervaltijd in de toekomst en begrensd; cookie heeft een vervaltermijn',T,async()=>{
  const r=await fetch(AUTH+'/get-session',{headers:{Accept:'application/json',Cookie:S.b.cookie.cookie},signal:AbortSignal.timeout(10000)});
  const body=await r.json();const exp=Date.parse(body?.session?.expiresAt);
  assert.ok(Number.isFinite(exp)&&exp>Date.now(),'expiresAt in the future');assert.ok(exp-Date.now()<=31*24*3600*1000,'expiry bounded (≤31 days)');
  assert.ok(S.b.cookie.attrs['max-age']||S.b.cookie.attrs.expires,'session cookie is not unbounded');
  // RepairFlow additionally refuses sessions older than 12 hours (unit + browser proof).
  record('provider session has bounded expiry',{daysUntilExpiry:Math.round((exp-Date.now())/864e5)});
 });
 it('P3c intrekking van één sessie via de provider: alleen die sessie ongeldig',T,async()=>{
  const extra=await signIn();const extraId=await verifySession(extra.cookie.cookie,{env});
  const list=await fetch(AUTH+'/list-sessions',{headers:{Accept:'application/json',Origin:E.PHIXAR_E2E_TRUSTED_ORIGIN,Cookie:S.b.cookie.cookie},signal:AbortSignal.timeout(10000)});
  assert.equal(list.status,200,'list-sessions '+list.status);const sessions=await list.json();
  const target=sessions.find(x=>x.id===extraId.sessionId);assert.ok(target&&target.token,'other session listed for the same user');
  const rv=await fetch(AUTH+'/revoke-session',{method:'POST',headers:{'Content-Type':'application/json',Origin:E.PHIXAR_E2E_TRUSTED_ORIGIN,Cookie:S.b.cookie.cookie},body:JSON.stringify({token:target.token}),signal:AbortSignal.timeout(10000)});
  assert.equal(rv.status,200,'revoke-session '+rv.status);
  assert.equal(await valid(extra.cookie.cookie),false);assert.equal(await valid(S.b.cookie.cookie),true);assert.equal(await valid(S.a.cookie.cookie),true);
  record('provider revoke-session invalidates exactly one session',{sessionsListed:sessions.length});
 });
 it('P4 uitloggen in profiel A: A ongeldig, B geldig; oude cookie niet herbruikbaar',T,async()=>{
  assert.equal(await post('/sign-out',S.a.cookie.cookie),200);
  assert.equal(await valid(S.a.cookie.cookie),false);assert.equal(await valid(S.b.cookie.cookie),true);
  record('sign-out invalidates only that session; replayed old cookie rejected');
 });
 it('P5 providerbrede intrekking: alle sessies ongeldig, nieuwe login werkt',T,async()=>{
  const c=await signIn();
  assert.equal(await post('/revoke-sessions',S.b.cookie.cookie),200);
  assert.equal(await valid(S.b.cookie.cookie),false);assert.equal(await valid(c.cookie.cookie),false);
  const d=await signIn();assert.equal(await valid(d.cookie.cookie),true);S.d=d;
  record('provider-wide revoke-sessions invalidates all sessions; new login works');
 });
 it('P6 vervalste en gemanipuleerde cookies geweigerd',T,async()=>{
  const {name,value}=S.d.cookie;
  assert.equal(await valid(name+'='+value.slice(0,-2)+(value.endsWith('A')?'B':'A')+value.slice(-1)),false);
  assert.equal(await valid(name+'=forged-token-value'),false);
  record('tampered and forged session tokens rejected by the provider');
 });
 it('P6b onbekend wachtwoord en onbekende gebruiker krijgen geen sessie',T,async()=>{
  for(const body of [{email:E.PHIXAR_E2E_USER_EMAIL,password:'wrong-'+Date.now()},{email:'nobody-'+Date.now()+'@example.com',password:'x'.repeat(16)}]){
   const r=await fetch(AUTH+'/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:E.PHIXAR_E2E_TRUSTED_ORIGIN},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
   assert.ok(r.status>=400&&r.status<500,'status '+r.status);assert.equal(parseSetCookie(r.headers.getSetCookie()),null);
  }
  const su=await fetch(AUTH+'/sign-up/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:E.PHIXAR_E2E_TRUSTED_ORIGIN},body:JSON.stringify({email:'signup-'+Date.now()+'@example.com',password:'x'.repeat(20),name:'x'}),signal:AbortSignal.timeout(10000)});
  assert.ok(su.status>=400,'self sign-up must stay disabled, got '+su.status);
  record('wrong password, unknown user and self sign-up are refused');
 });
 // P7/P8: the exact chain the phone uses: browser → Vercel preview (real api/ functions,
 // real env) → Neon Auth + isolated Neon database. Requires the Vercel automation bypass.
 const previewBlocked=()=>{if(!BYPASS)throw Object.assign(Error('BLOCKED: PHIXAR_E2E_VERCEL_BYPASS not set; the preview is behind Vercel Deployment Protection'),{code:'BLOCKED'})};
 async function preview(p,{method='GET',body,cookie,origin}={}){
  const headers={Accept:'application/json','x-vercel-protection-bypass':BYPASS,'User-Agent':'PHIXAR-provider-e2e (GitHub Actions)'};
  if(body!==undefined)headers['Content-Type']='application/json';if(origin)headers.Origin=origin;if(cookie)headers.Cookie=cookie;
  const r=await fetch(ORIGIN+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(15000)});
  let json=null;try{json=await r.json()}catch{}
  if(r.status===401&&!json)throw Object.assign(Error('BLOCKED: Vercel rejected the configured bypass value'),{code:'BLOCKED'});
  return {status:r.status,json,setCookie:r.headers.getSetCookie()};
 }
 it('P7 live preview: aanmelden via /api/auth/session, rol manager, werkruimte, afmelden',T,async()=>{
  previewBlocked();
  const st=await preview('/api/auth/session',{method:'POST',origin:ORIGIN,body:{action:'status'}});
  assert.equal(st.status,200,'gate '+st.status+' '+JSON.stringify(st.json));assert.equal(st.json.enabled,true);
  const si=await preview('/api/auth/session',{method:'POST',origin:ORIGIN,body:{action:'signIn',email:E.PHIXAR_E2E_USER_EMAIL,password:E.PHIXAR_E2E_USER_PASSWORD}});
  assert.equal(si.status,200,'sign-in '+si.status+' '+(si.json?.error||''));assert.equal(si.json.signedIn,true);assert.doesNotMatch(JSON.stringify(si.json),/token|password/i);
  assert.equal(si.setCookie.length,1);const c=parseSetCookie(si.setCookie);
  assert.equal(c.attrs.httponly,true);assert.equal(c.attrs.secure,true);assert.equal(String(c.attrs.samesite).toLowerCase(),'lax');assert.equal(c.attrs.path,'/');assert.equal(c.attrs['max-age'],'43200');assert.equal(c.attrs.domain,undefined,'host-only cookie');
  const me=await preview('/api/auth/me',{cookie:c.cookie});assert.deepEqual(me.json,{authenticated:true,role:E.PHIXAR_E2E_EXPECTED_ROLE});
  const ws=await preview('/api/workspace',{cookie:c.cookie});assert.equal(ws.status,200,'workspace '+ws.status);
  const list=await preview('/api/auth/session',{method:'POST',origin:ORIGIN,cookie:c.cookie,body:{action:'sessions'}});
  assert.equal(list.status,200);assert.ok(list.json.sessions.some(x=>x.current));assert.doesNotMatch(JSON.stringify(list.json),/token|ipAddress/);
  const forged=await preview('/api/auth/me',{cookie:c.name+'=forged-'+crypto.randomBytes(24).toString('base64url')});assert.ok([401,403].includes(forged.status),'forged '+forged.status);
  const out=await preview('/api/auth/logout',{method:'POST',origin:ORIGIN,cookie:c.cookie,body:{}});assert.equal(out.status,200);
  assert.ok([401,403].includes((await preview('/api/auth/me',{cookie:c.cookie})).status),'old cookie refused after logout');
  record('live preview chain: sign-in → first-party cookie → /api/auth/me manager → /api/workspace 200 → logout',{commit:st.json.environment.commit,me:me.status,workspace:ws.status,sessionsListed:list.json.sessions.length});
 });
 it('P8 echte Chromium (Galaxy S24-emulatie) op /test-account van de live preview: twee onafhankelijke sessies',T,async()=>{
  previewBlocked();
  const {chromium,devices}=require('playwright-core');const {chromePath}=require('../harness/browser');
  const executablePath=chromePath();assert.ok(executablePath,'Chrome/Chromium required');
  const browser=await chromium.launch({executablePath,headless:true});const contexts=[];
  try{
   const phones=[];
   for(const label of ['A','B']){
    const ctx=await browser.newContext({...devices['Galaxy S24']});contexts.push(ctx);
    // The bypass header goes ONLY to the pinned preview origin, never to third parties.
    await ctx.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===ORIGIN?route.continue({headers:{...route.request().headers(),'x-vercel-protection-bypass':BYPASS}}):route.continue()});
    const page=await ctx.newPage();await page.goto(ORIGIN+'/test-account');
    await page.waitForFunction(()=>!/controleren/.test(document.getElementById('status').textContent),null,{timeout:20000});
    assert.match(await page.textContent('#status'),/Klaar om aan te melden|Aangemeld/,label+' status');
    await page.fill('#email',E.PHIXAR_E2E_USER_EMAIL);await page.fill('#password',E.PHIXAR_E2E_USER_PASSWORD);await page.click('#signin');
    await page.waitForFunction(()=>/manager|geen toegang|onjuist|Mislukt/.test(document.getElementById('whoami').textContent+document.getElementById('status').textContent),null,{timeout:20000});
    assert.match(await page.textContent('#whoami'),/Rol in de testorganisatie: manager/,label+' role');
    const cookies=(await ctx.cookies(ORIGIN)).filter(x=>/session_token$/.test(x.name));assert.equal(cookies.length,1);assert.equal(cookies[0].httpOnly,true);
    phones.push({ctx,page,cookie:cookies[0].value});
   }
   assert.notEqual(phones[0].cookie,phones[1].cookie,'independent sessions');
   const status=p=>p.page.evaluate(async()=>(await fetch('/api/auth/me',{cache:'no-store'})).status);
   await phones[1].page.click('#logout');await phones[1].page.waitForFunction(()=>/Afgemeld/.test(document.getElementById('status').textContent));
   assert.notEqual(await status(phones[1]),200);assert.equal(await status(phones[0]),200);
   await phones[0].page.click('#logout');await phones[0].page.waitForFunction(()=>/Afgemeld/.test(document.getElementById('status').textContent));
   record('real Chromium with Galaxy S24 emulation on the live preview page: two independent sessions, sign-out isolates them',{device:'emulated, not a physical Samsung'});
  }finally{await Promise.allSettled(contexts.map(c=>c.close()));await browser.close()}
 });
});
