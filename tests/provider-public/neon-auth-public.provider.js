'use strict';
// REAL Neon Auth provider + REAL Vercel preview checks that need NO credentials.
// Targets only the reviewed isolated Neon Auth branch and the pinned test preview
// (tests/provider/isolated-target.js). Unauthenticated and non-mutating: no sign-in
// succeeds, no account is created (sign-up is closed and asserted closed), no email
// is sent (reset endpoints are probed with an invalid body only).
//
// What this proves: the hosted provider refuses unauthenticated, forged and
// unknown-user access, keeps sign-up closed, and exposes the session-management and
// official reset endpoints the authenticated suite relies on; the preview refuses
// anonymous and forged-cookie access and sends the anti-framing headers.
// What it does NOT prove: a successful real login, real session revocation, or the
// browser → Vercel → Neon chain with a signed-in user (tests/provider/, needs secrets).
const {describe,it,after}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {verifySession}=require('../../lib/neon-auth-session');
const {AUTH,ORIGIN}=require('../provider/isolated-target');
const OUT=path.resolve(__dirname,'..','..','test-results','provider-public');
const T={timeout:30000};const evidence=[];
function record(check,detail={}){evidence.push({check,mode:'real-provider-unauthenticated',result:'PASS',detail})}
after(()=>{fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify({generatedAt:new Date().toISOString(),authHost:new URL(AUTH).host,previewHost:new URL(ORIGIN).host,checks:evidence},null,1))});

const COOKIE_NAME='__Secure-neon-auth.session_token';
async function call(base,p,{method='GET',body,cookie,origin=ORIGIN}={}){
 const headers={Accept:'application/json'};
 if(body!==undefined)headers['Content-Type']='application/json';
 if(origin)headers.Origin=origin;
 if(cookie)headers.Cookie=cookie;
 const r=await fetch(base+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(15000)});
 const text=await r.text();let json=null;try{json=JSON.parse(text)}catch{}
 return {status:r.status,json,text,headers:r.headers,setCookie:r.headers.getSetCookie()};
}
const noSessionCookie=r=>assert.equal(r.setCookie.some(c=>/session_token=[^;]{8,}/.test(c)),false,'no session cookie issued');
const forgedToken=()=>crypto.randomBytes(32).toString('base64url')+'.'+crypto.randomBytes(32).toString('base64url');

describe('Echte Neon Auth-provider — zonder credentials (geïsoleerde branch)',()=>{
 it('U1 provider bereikbaar op het vastgepinde geïsoleerde endpoint',T,async()=>{
  const r=await call(AUTH,'/ok');assert.equal(r.status,200);assert.equal(r.json?.ok,true);
  record('isolated Neon Auth endpoint reachable',{status:r.status});
 });
 it('U2 zonder cookie en met vervalste cookie geen sessie (provider en RepairFlow verifySession)',T,async()=>{
  const none=await call(AUTH,'/get-session');assert.ok(none.status===401||(none.status===200&&none.json===null),'status '+none.status);
  const forged=await call(AUTH,'/get-session',{cookie:COOKIE_NAME+'='+forgedToken()});
  assert.ok(forged.status===401||(forged.status===200&&forged.json===null),'status '+forged.status);
  await assert.rejects(verifySession(COOKIE_NAME+'='+forgedToken(),{env:{REPAIRFLOW_NEON_AUTH_URL:AUTH}}));
  record('no session without cookie or with forged token',{noCookie:none.status,forged:forged.status});
 });
 it('U3 onbekende gebruiker krijgt geen sessie',T,async()=>{
  const r=await call(AUTH,'/sign-in/email',{method:'POST',body:{email:'nobody-'+crypto.randomUUID()+'@example.invalid',password:crypto.randomBytes(18).toString('base64url')}});
  assert.ok(r.status>=400&&r.status<500,'status '+r.status);noSessionCookie(r);
  record('unknown user sign-in refused',{status:r.status,code:r.json?.code});
 });
 it('U4 publieke registratie blijft gesloten',T,async()=>{
  const r=await call(AUTH,'/sign-up/email',{method:'POST',body:{email:'signup-'+crypto.randomUUID()+'@example.invalid',password:crypto.randomBytes(18).toString('base64url'),name:'PHIXAR probe'}});
  assert.ok(r.status>=400&&r.status<500,'self sign-up must stay disabled, got '+r.status);noSessionCookie(r);
  record('self sign-up refused',{status:r.status,code:r.json?.code});
 });
 it('U5 sessiebeheer-endpoints bestaan en vereisen een sessie',T,async()=>{
  const out={};
  for(const [m,p,b] of [['GET','/list-sessions'],['POST','/revoke-session',{token:forgedToken()}],['POST','/revoke-sessions',{}],['POST','/revoke-other-sessions',{}]]){
   const r=await call(AUTH,p,{method:m,body:b});out[p]=r.status;
   assert.notEqual(r.status,404,p+' must exist');assert.ok(r.status===401||r.status===403,p+' without session must be refused, got '+r.status);
  }
  const so=await call(AUTH,'/sign-out',{method:'POST',body:{}});out['/sign-out']=so.status;assert.notEqual(so.status,404);noSessionCookie(so);
  record('session management endpoints exist and require a session',out);
 });
 it('U6 officiële reset-endpoints bestaan (alleen ongeldige invoer, er wordt geen e-mail verstuurd)',T,async()=>{
  const out={};
  // Documented by Neon for Managed Better Auth (Email OTP plugin): must exist.
  for(const p of ['/forget-password/email-otp','/email-otp/reset-password','/email-otp/send-verification-otp','/email-otp/verify-email']){
   const r=await call(AUTH,p,{method:'POST',body:{}});out[p]=r.status;
   assert.notEqual(r.status,404,p+' must exist');assert.ok(r.status>=400&&r.status<500,p+' with empty body must be a validation error, got '+r.status);
  }
  // Link-based reset: name differs between Better Auth versions; recorded, not asserted.
  for(const p of ['/request-password-reset','/forget-password']){const r=await call(AUTH,p,{method:'POST',body:{}});out[p]=r.status}
  const ref=await call(AUTH,'/reference',{origin:null});out['/reference']=ref.status;
  record('official password-reset and email-OTP endpoints exist',out);
 });
});

describe('Echte Vercel-preview van de testbranch — zonder credentials',()=>{
 let protectedPreview=false;
 it('V1 preview bereikbaar zonder data te tonen',T,async()=>{
  const r=await call(ORIGIN,'/api/auth/status',{origin:null});
  if(r.status===401||r.status===403){protectedPreview=true;
   throw Object.assign(Error('BLOCKED: preview is behind Vercel deployment protection ('+r.status+'); anonymous chain checks impossible'),{code:'BLOCKED'})}
  assert.equal(r.status,200);assert.equal(r.json?.canAccessCustomerData,false);
  record('preview reachable; status endpoint exposes no customer data',{status:r.status,loginEnabled:r.json?.authentication?.loginEnabled});
 });
 it('V2 anoniem en met vervalste cookie geen staff-toegang of werkruimte',T,async()=>{
  assert.equal(protectedPreview,false,'BLOCKED by V1');
  const out={};
  for(const [p,cookie] of [['/api/auth/me'],['/api/auth/me',COOKIE_NAME+'='+forgedToken()],['/api/workspace'],['/api/workspace',COOKIE_NAME+'='+forgedToken()],['/api/contexts',COOKIE_NAME+'='+forgedToken()]]){
   const r=await call(ORIGIN,p,{origin:null,cookie});out[p+(cookie?' forged':' anon')]=r.status;
   assert.ok([401,403,503].includes(r.status),p+' must refuse, got '+r.status);assert.notEqual(r.json?.authenticated,true);
  }
  const sec=await call(ORIGIN,'/api/security',{method:'POST',body:{action:'securityStatus'},cookie:COOKIE_NAME+'='+forgedToken()});
  out['/api/security forged']=sec.status;assert.ok([401,403,503].includes(sec.status),'security '+sec.status);
  const foreign=await call(ORIGIN,'/api/security',{method:'POST',body:{action:'securityStatus'},origin:'https://evil.example'});
  out['/api/security foreign-origin']=foreign.status;assert.ok([401,403,503].includes(foreign.status),'foreign origin '+foreign.status);
  record('anonymous and forged-cookie requests refused on the live preview',out);
 });
 it('V3 anti-framing- en sniffingheaders live op de preview',T,async()=>{
  assert.equal(protectedPreview,false,'BLOCKED by V1');
  const r=await call(ORIGIN,'/security',{origin:null});assert.equal(r.status,200);
  assert.equal(r.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.match(r.headers.get('content-security-policy')||'',/frame-ancestors 'self'/);
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  record('live preview sends X-Frame-Options, frame-ancestors and nosniff');
 });
});
