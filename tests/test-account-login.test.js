'use strict';
// Unit tests for the preview-only owner test login (lib/test-account-login.js).
// The provider is a recorded stand-in here; the real provider runs in tests/provider.
const {test}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {handleTestAccount,gate,deviceLabel}=require('../lib/test-account-login');
const PINNED=require('../lib/isolated-test-target');

const EMAIL='pinned-owner@example.invalid';
const TARGET=Object.freeze({...PINNED,EMAIL_SHA256:crypto.createHash('sha256').update(EMAIL).digest('hex')});
const USER=TARGET.USER_ID,OTHER='0b5d7a3e-1111-4222-8333-444455556666';
const ENV=Object.freeze({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:TARGET.GIT_BRANCH,VERCEL_GIT_COMMIT_SHA:'0123456789abcdef0123',
 REPAIRFLOW_NEON_AUTH_URL:TARGET.AUTH,REPAIRFLOW_APP_ORIGIN:TARGET.ORIGIN,REPAIRFLOW_ORGANIZATION_ID:TARGET.ORGANIZATION_ID,REPAIRFLOW_BRANCH_ID:TARGET.BRANCH_ID,
 REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:'postgresql://rf_runtime_login:pw@'+TARGET.DATABASE_HOSTS[1]+'/neondb?sslmode=require',
 DATABASE_URL:'postgresql://rf_runtime_login:pw@'+TARGET.DATABASE_HOSTS[0]+'/neondb',REPAIRFLOW_WEBAUTHN_RP_ID:new URL(TARGET.ORIGIN).hostname});
const COOKIE='__Secure-neon-auth.session_token';
const SID='5f0d3c1e-9a7b-4c2d-8e1f-0a1b2c3d4e5f',SID2='6a1e4d2f-0b8c-4d3e-9f20-1b2c3d4e5f60';

function res(){const r={statusCode:0,headers:{},body:undefined,setHeader(k,v){this.headers[k.toLowerCase()]=v},status(c){this.statusCode=c;return this},json(b){this.body=b;return this}};return r}
function req(body,{origin=TARGET.ORIGIN,cookie,type='application/json'}={}){return {method:'POST',headers:{origin,cookie,'content-type':type,'user-agent':'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36'},body}}
function reply(status,body,cookies=[]){return {ok:status>=200&&status<300,status,headers:{getSetCookie:()=>cookies},json:async()=>body}}
// Recorded provider stand-in: tokens tok-a (USER) and tok-x (OTHER) exist.
function provider(over={}){
 const calls=[];
 const fetcher=async(url,init={})=>{
  const u=new URL(url);assert.equal(u.origin+u.pathname.slice(0,u.pathname.lastIndexOf('/auth')+5),TARGET.AUTH,'only the pinned Auth URL is called');
  const path=u.pathname.slice(u.pathname.lastIndexOf('/auth')+5);
  const body=init.body?JSON.parse(init.body):undefined;calls.push({path,method:init.method||'GET',body,headers:init.headers});
  if(over[path])return over[path](init,body);
  if(path==='/get-session'){
   const tok=/session_token=([^;]+)/.exec(init.headers?.Cookie||'')?.[1];
   if(tok!=='tok-a'&&tok!=='tok-x')return reply(200,null);
   return reply(200,{session:{id:tok==='tok-a'?SID:SID2,createdAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+864e5).toISOString()},user:{id:tok==='tok-a'?USER:OTHER}});
  }
  if(path==='/sign-in/email')return reply(200,{redirect:false,token:'tok-a',user:{id:USER,email:EMAIL.toUpperCase()}},[COOKIE+'=tok-a; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=None','__Secure-neon-auth.session_data=abc; Path=/; HttpOnly; Secure']);
  if(path==='/list-sessions')return reply(200,[
   {id:SID,token:'tok-a',ipAddress:'203.0.113.9',userAgent:'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0',createdAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+864e5).toISOString()},
   {id:SID2,token:'tok-b',ipAddress:'198.51.100.7',userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/122.0 Mobile',createdAt:new Date(Date.now()-3*864e5).toISOString(),expiresAt:new Date(Date.now()+864e5).toISOString()}]);
  return reply(200,{status:true});
 };
 return {fetcher,calls};
}
async function call(body,opts={},{env=ENV,p=provider()}={}){const r=res();await handleTestAccount(req(body,opts),r,{env,fetcher:p.fetcher,target:TARGET});return {r,p}}

test('closed outside the pinned preview: production and other branches keep 405 without any provider call',async()=>{
 for(const env of [{...ENV,VERCEL_ENV:'production'},{...ENV,VERCEL_ENV:'development'},{...ENV,VERCEL_GIT_COMMIT_REF:'main'},{...ENV,VERCEL_ENV:undefined},{}]){
  const {r,p}=await call({action:'status'},{},{env});
  assert.equal(r.statusCode,405);assert.equal(r.headers.allow,'GET');assert.deepEqual(r.body,{error:'method_not_allowed'});assert.equal(p.calls.length,0);
 }
 // The real pinned target (not the test stand-in) is used when nothing is injected.
 const r=res();await handleTestAccount(req({action:'status'}),r,{env:{VERCEL_ENV:'production'}});assert.equal(r.statusCode,405);
});

test('every isolation check fails closed on the test preview and names only the failed check',async()=>{
 const prod='ep-wandering-surf-production.c-8.eu-central-1.aws.neon.tech';
 const cases=[
  [{REPAIRFLOW_NEON_AUTH_URL:'https://ep-production.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth'},'auth_url'],
  [{REPAIRFLOW_NEON_AUTH_URL:undefined},'auth_url'],
  [{REPAIRFLOW_APP_ORIGIN:'https://repair-flow-theta.vercel.app'},'app_origin'],
  [{REPAIRFLOW_ORGANIZATION_ID:'b7c7eeac-d1cc-42a3-bd09-d25a2280f474'},'tenant'],
  [{REPAIRFLOW_BRANCH_ID:'cd8c7cb9-66c1-40d5-b049-fa324d99607a'},'tenant'],
  [{REPAIRFLOW_DYNAMIC_CONTEXT_ENABLED:'true'},'single_tenant_context'],
  [{REPAIRFLOW_RUNTIME_ROLE:'neondb_owner'},'runtime_role'],
  [{REPAIRFLOW_RUNTIME_DATABASE_URL:'postgresql://neondb_owner:pw@'+TARGET.DATABASE_HOSTS[0]+'/neondb'},'runtime_database'],
  [{REPAIRFLOW_RUNTIME_DATABASE_URL:'postgresql://rf_runtime_login:pw@'+prod+'/neondb'},'runtime_database'],
  [{REPAIRFLOW_RUNTIME_DATABASE_URL:'postgresql://rf_runtime_login:pw@'+TARGET.DATABASE_HOSTS[0]+'/other'},'runtime_database'],
  [{REPAIRFLOW_RUNTIME_DATABASE_URL:'not a url'},'runtime_database'],
  [{DATABASE_URL:'postgresql://neondb_owner:pw@'+prod+'/neondb'},'database_url']
 ];
 for(const [over,check] of cases){
  const {r,p}=await call({action:'status'},{},{env:{...ENV,...over}});
  assert.equal(r.statusCode,503,check);assert.deepEqual(r.body,{enabled:false,failedCheck:check});assert.equal(p.calls.length,0);
  assert.doesNotMatch(JSON.stringify(r.body),/pw@|postgres/);
 }
 assert.equal(gate(ENV,TARGET).ok,true);assert.equal(gate({...ENV,DATABASE_URL:undefined},TARGET).ok,true);
});

test('request hygiene: same origin, JSON only, bounded body, known actions, no-store',async()=>{
 assert.equal((await call({action:'status'},{origin:'https://evil.example'})).r.statusCode,403);
 assert.equal((await call({action:'status'},{origin:null})).r.statusCode,403);
 assert.equal((await call('action=status',{type:'application/x-www-form-urlencoded'})).r.statusCode,415);
 assert.equal((await call(['status'])).r.statusCode,400);
 assert.equal((await call({action:'status',pad:'x'.repeat(3000)})).r.statusCode,400);
 for(const action of ['constructor','__proto__','toString','deleteUser','',undefined])assert.equal((await call({action})).r.body.error,'unknown_action');
 const {r}=await call({action:'status'});
 assert.equal(r.headers['cache-control'],'no-store, private');assert.equal(r.headers['referrer-policy'],'no-referrer');
});

test('status shows the isolated environment and no credentials',async()=>{
 const {r,p}=await call({action:'status'});
 assert.equal(r.statusCode,200);assert.equal(p.calls.length,0);
 assert.deepEqual(r.body.environment,{vercelEnv:'preview',gitBranch:TARGET.GIT_BRANCH,commit:'0123456789ab',authHost:new URL(TARGET.AUTH).host,databaseHost:TARGET.DATABASE_HOSTS[1],
  runtimeRole:'rf_runtime_login',organizationId:TARGET.ORGANIZATION_ID,organizationName:TARGET.ORGANIZATION_NAME,branchId:TARGET.BRANCH_ID,singleTenantContext:true,passkeyRelyingParty:true});
 assert.equal(r.body.signedIn,false);assert.doesNotMatch(JSON.stringify(r.body),/pw|@/);
 const signed=await call({action:'status'},{cookie:COOKIE+'=tok-a'});assert.equal(signed.r.body.signedIn,true);
 const other=await call({action:'status'},{cookie:COOKIE+'=tok-x'});assert.equal(other.r.body.signedIn,false,'another user is never reported as the test account');
});

test('only the pinned identity reaches the provider; other addresses are refused locally',async()=>{
 for(const email of ['someone.else@gmail.com','existing-staff@example.com']){
  for(const action of ['sendResetCode','resetPassword','sendVerificationCode','verifyEmail','signIn']){
   const {r,p}=await call({action,email,otp:'123456',password:'a-long-enough-password'});
   assert.equal(r.statusCode,403,action);assert.deepEqual(r.body,{error:'account_not_allowed'});assert.equal(p.calls.length,0);
  }
 }
 assert.equal((await call({action:'signIn',email:'not-an-email',password:'x'})).r.body.error,'invalid_email');
});

test('official email-OTP password reset: pinned address, code and password only in the provider body',async()=>{
 const sent=await call({action:'sendResetCode',email:' '+EMAIL.toUpperCase()+' '});
 assert.deepEqual(sent.r.body,{sent:true});
 assert.deepEqual(sent.p.calls.map(c=>[c.path,c.method,c.body]),[['/forget-password/email-otp','POST',{email:EMAIL}]]);
 assert.equal(sent.p.calls[0].headers.Origin,TARGET.ORIGIN);assert.match(sent.p.calls[0].headers['User-Agent'],/SamsungBrowser/);
 for(const [body,error] of [[{otp:'12',password:'a-long-enough-password'},'invalid_code'],[{otp:'123456',password:'short'},'password_too_short'],[{otp:'123456',password:'x'.repeat(129)},'invalid_password'],[{otp:'123456',password:12345678901234},'invalid_password']]){
  const {r,p}=await call({action:'resetPassword',email:EMAIL,...body});assert.equal(r.body.error,error);assert.equal(p.calls.length,0);
 }
 const done=await call({action:'resetPassword',email:EMAIL,otp:'123456',password:'a-long-enough-password'});
 assert.deepEqual(done.r.body,{passwordSet:true});
 assert.deepEqual(done.p.calls[0].body,{email:EMAIL,otp:'123456',password:'a-long-enough-password'});
 assert.doesNotMatch(JSON.stringify(done.r.body)+JSON.stringify(done.r.headers),/a-long-enough-password|123456/);
});

test('email verification via the official OTP flow and no session forwarded from it',async()=>{
 const s=await call({action:'sendVerificationCode',email:EMAIL});
 assert.deepEqual(s.p.calls[0].body,{email:EMAIL,type:'email-verification'});
 const p=provider({'/email-otp/verify-email':()=>reply(200,{status:true,token:'tok-a',user:{id:USER}},[COOKIE+'=tok-a; Path=/'])});
 const v=await call({action:'verifyEmail',email:EMAIL,otp:'654321'},{}, {p});
 assert.deepEqual(v.r.body,{verified:true});assert.equal(v.r.headers['set-cookie'],undefined);
});

test('provider errors are mapped to safe codes',async()=>{
 const cases=[[400,{code:'INVALID_OTP',message:'secret detail'},400,'invalid_otp'],[403,{code:'TOO_MANY_ATTEMPTS'},403,'too_many_attempts'],[429,{},429,'too_many_requests'],
  [500,{code:'INTERNAL'},503,'auth_unavailable'],[400,{code:'SOMETHING_INTERNAL',message:'stack'},400,'provider_rejected'],[401,{code:'INVALID_EMAIL_OR_PASSWORD'},401,'invalid_email_or_password'],
  [403,{code:'EMAIL_NOT_VERIFIED'},403,'email_not_verified']];
 for(const [status,body,code,error] of cases){
  const p=provider({'/email-otp/reset-password':()=>reply(status,body),'/sign-in/email':()=>reply(status,body)});
  const a=await call({action:'resetPassword',email:EMAIL,otp:'123456',password:'a-long-enough-password'},{},{p});
  assert.equal(a.r.statusCode,code);assert.deepEqual(a.r.body,{error});
 }
 const down=provider({'/sign-in/email':()=>{throw Error('ECONNRESET')}});
 assert.deepEqual((await call({action:'signIn',email:EMAIL,password:'pw'},{},{p:down})).r.body,{error:'auth_unavailable'});
});

test('sign-in sets exactly one first-party HttpOnly cookie and never returns the provider token',async()=>{
 const {r,p}=await call({action:'signIn',email:EMAIL,password:'a-long-enough-password'});
 assert.equal(r.statusCode,200);assert.equal(r.body.signedIn,true);
 assert.deepEqual(r.headers['set-cookie'],[COOKIE+'=tok-a; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200']);
 assert.doesNotMatch(JSON.stringify(r.body),/tok-a|token|password/);
 assert.deepEqual(p.calls.map(c=>c.path),['/sign-in/email','/get-session']);
});

test('sign-in that resolves to another identity is refused and that provider session is signed out',async()=>{
 const p=provider({'/sign-in/email':()=>reply(200,{user:{id:OTHER,email:EMAIL}},[COOKIE+'=tok-x; Path=/'])});
 const {r}=await call({action:'signIn',email:EMAIL,password:'pw'},{},{p});
 assert.deepEqual(r.body,{error:'account_not_allowed'});assert.equal(r.headers['set-cookie'],undefined);
 assert.deepEqual(p.calls.map(c=>c.path),['/sign-in/email','/get-session','/sign-out']);
 const noCookie=provider({'/sign-in/email':()=>reply(200,{user:{id:USER,email:EMAIL}},[])});
 assert.deepEqual((await call({action:'signIn',email:EMAIL,password:'pw'},{},{p:noCookie})).r.body,{error:'cookie_unavailable'});
 const twoCookies=provider({'/sign-in/email':()=>reply(200,{user:{id:USER,email:EMAIL}},[COOKIE+'=tok-a; Path=/','better-auth.session_token=tok-a; Path=/'])});
 assert.deepEqual((await call({action:'signIn',email:EMAIL,password:'pw'},{},{p:twoCookies})).r.body,{error:'cookie_unavailable'});
});

test('session list hides tokens and IP addresses, marks the current session; revoke-other-sessions',async()=>{
 assert.equal((await call({action:'sessions'})).r.statusCode,401);
 assert.deepEqual((await call({action:'sessions'},{cookie:COOKIE+'=tok-x'})).r.body,{error:'account_not_allowed'});
 assert.equal((await call({action:'sessions'},{cookie:COOKIE+'=forged'})).r.statusCode,401);
 const {r,p}=await call({action:'sessions'},{cookie:COOKIE+'=tok-a'});
 assert.equal(r.statusCode,200);assert.equal(r.body.sessions.length,2);
 assert.deepEqual(r.body.sessions.map(s=>[s.current,s.device,s.usableInApp]),[[true,'Samsung Internet · Android',true],[false,'Chrome · Android',false]]);
 assert.doesNotMatch(JSON.stringify(r.body),/tok-|203\.0|198\.51|ipAddress|token/);
 assert.equal(p.calls.find(c=>c.path==='/list-sessions').headers.Cookie,COOKIE+'=tok-a');
 const rv=await call({action:'revokeOtherSessions'},{cookie:COOKIE+'=tok-a'});
 assert.deepEqual(rv.r.body,{revoked:true});assert.deepEqual(rv.p.calls.map(c=>c.path),['/get-session','/revoke-other-sessions']);
 assert.equal((await call({action:'revokeOtherSessions'},{cookie:COOKIE+'=tok-x'})).r.statusCode,403);
});

test('nothing is logged, whatever the outcome',async()=>{
 const seen=[];const orig={};for(const m of ['log','info','warn','error','debug'])orig[m]=console[m],console[m]=(...a)=>seen.push(a);
 try{
  await call({action:'signIn',email:EMAIL,password:'a-long-enough-password'});
  await call({action:'resetPassword',email:EMAIL,otp:'123456',password:'a-long-enough-password'},{},{p:provider({'/email-otp/reset-password':()=>reply(500,{})})});
  await call({action:'signIn',email:EMAIL,password:'pw'},{},{p:provider({'/sign-in/email':()=>{throw Error('boom')}})});
 }finally{Object.assign(console,orig)}
 assert.deepEqual(seen,[]);
});

test('device labels are coarse',()=>{
 assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0'),'Samsung Internet · Android');
 assert.equal(deviceLabel('node'),'Server/CI');assert.equal(deviceLabel(undefined),'Onbekend');
});

test('api/auth/session dispatches POST only with marked test deps; unmarked deps fall back to the real (closed) defaults',async()=>{
 const {markTestDeps}=require('../lib/test-deps');
 const handler=(await import('../api/auth/session.js')).default;
 const p=provider();
 const marked=res();await handler(req({action:'status'}),marked,markTestDeps({env:ENV,fetcher:p.fetcher,testAccountTarget:TARGET}));
 assert.equal(marked.statusCode,200);assert.equal(marked.body.enabled,true);
 const unmarked=res();await handler(req({action:'status'}),unmarked,{env:ENV,fetcher:p.fetcher,testAccountTarget:TARGET});
 assert.equal(unmarked.statusCode,405,'process.env of the test runner is not the preview');
 const put=res();await handler({...req({}),method:'PUT'},put);assert.equal(put.statusCode,405);
});
