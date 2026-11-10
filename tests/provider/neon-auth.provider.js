'use strict';
// REAL Neon Auth provider E2E (opt-in). Never runs against mocks; without the
// required configuration the run FAILS as BLOCKED (it is never skipped or green).
//
// Run only against an ISOLATED Neon branch with SYNTHETIC users (sign-up disabled,
// accounts created by the owner with email+password). Never production credentials.
// Required environment (GitHub Actions secrets, workflow neon-auth-provider-e2e.yml):
//   PHIXAR_E2E_ENVIRONMENT=isolated        explicit acknowledgement
//   PHIXAR_E2E_NEON_AUTH_URL               https://<ep>.neonauth.<region>.neon.tech/<db>/auth
//   PHIXAR_E2E_TRUSTED_ORIGIN              an origin trusted by that Neon Auth branch
//   PHIXAR_E2E_USER_EMAIL / PHIXAR_E2E_USER_PASSWORD   synthetic test account
// Required (real app handlers + real isolated database):
//   PHIXAR_E2E_RUNTIME_DATABASE_URL, PHIXAR_E2E_ORGANIZATION_ID, PHIXAR_E2E_BRANCH_ID,
//   PHIXAR_E2E_EXPECTED_ROLE (owner|manager|technician|sales|none)
// Tokens and cookies are never printed; evidence.json contains only shapes/flags.
const {describe,it,before,after}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {verifySession,authUrl}=require('../../lib/neon-auth-session');
const {assertIsolatedTarget}=require('./isolated-target');
const E=process.env;const evidence=[];const OUT=path.resolve(__dirname,'..','..','test-results','provider-e2e');
const REQUIRED=['PHIXAR_E2E_ENVIRONMENT','PHIXAR_E2E_NEON_AUTH_URL','PHIXAR_E2E_TRUSTED_ORIGIN','PHIXAR_E2E_USER_EMAIL','PHIXAR_E2E_USER_PASSWORD',
 'PHIXAR_E2E_RUNTIME_DATABASE_URL','PHIXAR_E2E_ORGANIZATION_ID','PHIXAR_E2E_BRANCH_ID','PHIXAR_E2E_EXPECTED_ROLE'];
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
  assert.match(id.sessionId,UUID);assert.ok(id.subject);if(S.a.userId)assert.equal(id.subject,S.a.userId);
  assert.ok(Math.abs(Date.now()-Date.parse(id.createdAt))<120000,'fresh createdAt');
  S.a.identity=id;record('real /get-session accepted by verifySession',{sessionIdIsUuid:true,createdAtFresh:true});
 });
 it('P3 twee onafhankelijke logins = twee sessies',T,async()=>{
  S.b=await signIn();S.b.identity=await verifySession(S.b.cookie.cookie,{env});
  assert.notEqual(S.a.identity.sessionId,S.b.identity.sessionId);record('two sign-ins produce two provider sessions');
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
 it('P7 echte app-handlers + echte geïsoleerde database',T,async()=>{
  const {startAppServer}=require('../harness/app-server');
  const app=await startAppServer({realEnv:{REPAIRFLOW_NEON_AUTH_URL:E.PHIXAR_E2E_NEON_AUTH_URL,REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:E.PHIXAR_E2E_RUNTIME_DATABASE_URL,
   REPAIRFLOW_ORGANIZATION_ID:E.PHIXAR_E2E_ORGANIZATION_ID,REPAIRFLOW_BRANCH_ID:E.PHIXAR_E2E_BRANCH_ID,REPAIRFLOW_WEBAUTHN_RP_ID:'localhost'}});
  try{
   const get=p=>new Promise((res,rej)=>{const r=https.request(new URL(p,app.origin),{ca:app.cert,headers:{cookie:S.d.cookie.cookie}},x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>res({status:x.statusCode,body:JSON.parse(b||'null')}))});r.on('error',rej);r.end()});
   const me=await get('/api/auth/me');
   if(E.PHIXAR_E2E_EXPECTED_ROLE==='none')assert.equal(me.status,403);else assert.deepEqual(me.body,{authenticated:true,role:E.PHIXAR_E2E_EXPECTED_ROLE});
   const ws=await get('/api/workspace');assert.equal(ws.status,['owner','manager'].includes(E.PHIXAR_E2E_EXPECTED_ROLE)?200:403);
   record('real handlers with real provider session and real isolated database',{role:E.PHIXAR_E2E_EXPECTED_ROLE,me:me.status,workspace:ws.status});
  }finally{await app.close()}
 });
});
