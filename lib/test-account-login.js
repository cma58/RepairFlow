'use strict';
// Preview-only test login for the owner-confirmed account on the ISOLATED Neon Auth
// branch, usable from a phone browser (no terminal, CLI or Node.js needed).
//
// Enabled only when EVERY isolation check passes on this exact deployment:
//   Vercel preview of the P0 test branch, pinned Neon Auth URL, pinned app origin,
//   pinned synthetic organisation/branch, restricted runtime role on the isolated
//   database host, static single-tenant context. Anywhere else POST keeps answering
//   405 exactly as before (production behaviour unchanged).
//
// Passwords and one-time codes travel only browser → this function → Neon Auth over
// HTTPS in a JSON body. They are never logged, stored, echoed or put in a URL. The
// official Neon Auth flows are used unchanged (email OTP password reset, email OTP
// verification, email/password sign-in, session list/revocation). Provider session
// tokens never reach the browser; only the HttpOnly first-party cookie is set.
const crypto=require('node:crypto');
const {authUrl,appOrigin,sessionCookie,forwardedCookie,verifySession}=require('./neon-auth-session');
const PINNED=require('./isolated-test-target');
const {healthDatabaseUrl}=require('./health-database');

const PROVIDER_CODES=new Set(['INVALID_EMAIL_OR_PASSWORD','EMAIL_NOT_VERIFIED','INVALID_OTP','OTP_EXPIRED','TOO_MANY_ATTEMPTS','PASSWORD_TOO_SHORT','PASSWORD_TOO_LONG','USER_NOT_FOUND','INVALID_PASSWORD','TOO_MANY_REQUESTS']);
const FAIL=(status,error,extra)=>Object.assign(Error(error),{status,error,extra});

function sha256(text){return crypto.createHash('sha256').update(text,'utf8').digest()}
function sameHash(email,hex){const a=sha256(email),b=Buffer.from(hex,'hex');return b.length===a.length&&crypto.timingSafeEqual(a,b)}
function dbTarget(raw,target){
 let u;try{u=new URL(raw)}catch{return null}
 if(!['postgres:','postgresql:'].includes(u.protocol)||!target.DATABASE_HOSTS.includes(u.hostname)||u.pathname!=='/'+target.DATABASE_NAME)return null;
 return {host:u.hostname,user:decodeURIComponent(u.username)};
}

// null → not this deployment (keep 405). {ok:false,check} → right deployment but an
// isolation check failed (fail closed, name the check only). {ok:true,...} → open.
function gate(env,target=PINNED){
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!==target.GIT_BRANCH)return null;
 const fail=check=>({ok:false,check});
 let auth,origin;
 try{auth=authUrl(env)}catch{return fail('auth_url')}
 if(auth!==target.AUTH)return fail('auth_url');
 try{origin=appOrigin(env)}catch{return fail('app_origin')}
 if(origin!==target.ORIGIN)return fail('app_origin');
 if(env.REPAIRFLOW_ORGANIZATION_ID!==target.ORGANIZATION_ID||env.REPAIRFLOW_BRANCH_ID!==target.BRANCH_ID)return fail('tenant');
 if(env.REPAIRFLOW_DYNAMIC_CONTEXT_ENABLED==='true')return fail('single_tenant_context');
 if(env.REPAIRFLOW_RUNTIME_ROLE!=='rf_runtime_login')return fail('runtime_role');
 const db=dbTarget(env.REPAIRFLOW_RUNTIME_DATABASE_URL,target);
 if(!db||db.user!=='rf_runtime_login')return fail('runtime_database');
 // Every database a code path on this deployment opens must be the isolated one. All
 // pools use REPAIRFLOW_RUNTIME_DATABASE_URL (checked above); the only other reader is
 // /api/db-health, which resolves through healthDatabaseUrl (enforced by a source test).
 const health=dbTarget(healthDatabaseUrl(env),target);
 if(!health||health.user!=='rf_runtime_login')return fail('health_database');
 // A non-isolated DATABASE_URL injected by the Neon–Vercel integration is then unused;
 // it is reported (never its value), not silently ignored.
 const integrationDatabaseUrl=env.DATABASE_URL===undefined?'absent':dbTarget(env.DATABASE_URL,target)?'isolated':'foreign_unused';
 return {ok:true,auth,origin,databaseHost:db.host,integrationDatabaseUrl,rpIdMatches:env.REPAIRFLOW_WEBAUTHN_RP_ID===new URL(origin).hostname};
}

function readEmail(body,target){
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(!email||email.length>254||!/^[^\s@]+@[^\s@]+$/.test(email))throw FAIL(400,'invalid_email');
 if(!sameHash(email,target.EMAIL_SHA256))throw FAIL(403,'account_not_allowed');
 return email;
}
function readOtp(body){const otp=typeof body.otp==='string'?body.otp.trim():'';if(!/^[0-9A-Za-z]{4,12}$/.test(otp))throw FAIL(400,'invalid_code');return otp}
function readPassword(body,min){
 const p=body.password;
 if(typeof p!=='string'||p.length>128)throw FAIL(400,'invalid_password');
 if(p.length<min)throw FAIL(400,'password_too_short');
 return p;
}

async function provider(ctx,path,{method='POST',body,cookie}={}){
 let upstream;
 try{
  const headers={Accept:'application/json',Origin:ctx.origin};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(cookie)headers.Cookie=cookie;
  if(ctx.userAgent)headers['User-Agent']=ctx.userAgent;
  upstream=await ctx.fetcher(ctx.auth+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(8000)});
 }catch{throw FAIL(503,'auth_unavailable')}
 let data=null;try{data=await upstream.json()}catch{}
 if(upstream.status>=200&&upstream.status<300)return {data,cookies:upstream.headers?.getSetCookie?.()||[]};
 const code=PROVIDER_CODES.has(data?.code)?data.code.toLowerCase():null;
 if(upstream.status===429)throw FAIL(429,'too_many_requests');
 if(upstream.status>=500)throw FAIL(503,'auth_unavailable');
 throw FAIL(upstream.status===401||upstream.status===403?upstream.status:400,code||'provider_rejected');
}

async function currentSession(req,ctx){
 const cookie=sessionCookie(req.headers?.cookie);
 if(!cookie)throw FAIL(401,'authentication_required');
 let identity;
 try{identity=await verifySession(cookie,{env:ctx.env,fetcher:ctx.fetcher})}catch(e){throw FAIL(e.message==='UNAUTHORIZED'?401:503,e.message==='UNAUTHORIZED'?'authentication_required':'auth_unavailable')}
 if(identity.subject!==ctx.target.USER_ID)throw FAIL(403,'account_not_allowed');
 return {cookie,identity};
}
function deviceLabel(ua){
 if(typeof ua!=='string'||!ua)return 'Onbekend';
 const browser=/SamsungBrowser\//.test(ua)?'Samsung Internet':/EdgA?\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/HeadlessChrome\//.test(ua)?'Headless Chrome':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':/node|undici/i.test(ua)?'Server/CI':'Andere browser';
 const os=/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Windows/.test(ua)?'Windows':/Mac OS X/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'';
 return os?browser+' · '+os:browser;
}

const ACTIONS={
 async status(req,ctx){
  const g=ctx.gate;let signedIn=false,session=null;
  const cookie=sessionCookie(req.headers?.cookie);
  if(cookie){try{const id=await verifySession(cookie,{env:ctx.env,fetcher:ctx.fetcher});if(id.subject===ctx.target.USER_ID){signedIn=true;session={createdAt:id.createdAt}}}catch{}}
  return {status:200,body:{enabled:true,environment:{vercelEnv:'preview',gitBranch:ctx.target.GIT_BRANCH,commit:String(ctx.env.VERCEL_GIT_COMMIT_SHA||'').slice(0,12)||null,
   authHost:new URL(g.auth).host,databaseHost:g.databaseHost,runtimeRole:'rf_runtime_login',organizationId:ctx.target.ORGANIZATION_ID,organizationName:ctx.target.ORGANIZATION_NAME,
   branchId:ctx.target.BRANCH_ID,singleTenantContext:true,integrationDatabaseUrl:g.integrationDatabaseUrl,passkeyRelyingParty:g.rpIdMatches},identityPinned:true,signedIn,session}};
 },
 async sendResetCode(req,ctx){
  const email=readEmail(req.body,ctx.target);
  await provider(ctx,'/forget-password/email-otp',{body:{email}});
  return {status:200,body:{sent:true}};
 },
 async resetPassword(req,ctx){
  const email=readEmail(req.body,ctx.target),otp=readOtp(req.body),password=readPassword(req.body,12);
  await provider(ctx,'/email-otp/reset-password',{body:{email,otp,password}});
  return {status:200,body:{passwordSet:true}};
 },
 async sendVerificationCode(req,ctx){
  const email=readEmail(req.body,ctx.target);
  await provider(ctx,'/email-otp/send-verification-otp',{body:{email,type:'email-verification'}});
  return {status:200,body:{sent:true}};
 },
 async verifyEmail(req,ctx){
  const email=readEmail(req.body,ctx.target),otp=readOtp(req.body);
  // Any session the provider may create here is deliberately not forwarded: the
  // owner signs in explicitly afterwards.
  await provider(ctx,'/email-otp/verify-email',{body:{email,otp}});
  return {status:200,body:{verified:true}};
 },
 async signIn(req,ctx,res){
  const email=readEmail(req.body,ctx.target),password=readPassword(req.body,1);
  const {data,cookies}=await provider(ctx,'/sign-in/email',{body:{email,password}});
  const forwarded=cookies.map(forwardedCookie).filter(Boolean);
  if(forwarded.length!==1)throw FAIL(503,'cookie_unavailable');
  const pair=forwarded[0].split(';',1)[0];
  let identity;try{identity=await verifySession(pair,{env:ctx.env,fetcher:ctx.fetcher})}catch{throw FAIL(503,'session_unverified')}
  if(identity.subject!==ctx.target.USER_ID||data?.user?.id!==ctx.target.USER_ID||typeof data?.user?.email!=='string'||!sameHash(data.user.email.trim().toLowerCase(),ctx.target.EMAIL_SHA256)){
   await provider(ctx,'/sign-out',{body:{},cookie:pair}).catch(()=>{});
   throw FAIL(403,'account_not_allowed');
  }
  res.setHeader('Set-Cookie',forwarded);
  return {status:200,body:{signedIn:true,session:{createdAt:identity.createdAt}}};
 },
 async sessions(req,ctx){
  const {cookie,identity}=await currentSession(req,ctx);
  const {data}=await provider(ctx,'/list-sessions',{method:'GET',cookie});
  if(!Array.isArray(data))throw FAIL(503,'auth_unavailable');
  const sessions=data.filter(s=>s&&typeof s.id==='string').map(s=>({current:s.id===identity.sessionId,createdAt:s.createdAt||null,updatedAt:s.updatedAt||null,expiresAt:s.expiresAt||null,device:deviceLabel(s.userAgent),
   usableInApp:Number.isFinite(Date.parse(s.createdAt))&&Date.now()-Date.parse(s.createdAt)<12*3600*1000&&Date.parse(s.expiresAt)>Date.now()}))
   .sort((a,b)=>(b.current-a.current)||String(b.createdAt).localeCompare(String(a.createdAt)));
  return {status:200,body:{sessions}};
 },
 async revokeOtherSessions(req,ctx){
  const {cookie}=await currentSession(req,ctx);
  await provider(ctx,'/revoke-other-sessions',{body:{},cookie});
  return {status:200,body:{revoked:true}};
 }
};

async function handleTestAccount(req,res,{env=process.env,fetcher=fetch,target=PINNED}={}){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 const g=gate(env,target);
 if(!g){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'})}
 if(!g.ok)return res.status(503).json({enabled:false,failedCheck:g.check});
 if(req.headers?.origin!==g.origin)return res.status(403).json({error:'origin_denied'});
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return res.status(415).json({error:'json_required'});
 const body=req.body;
 if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>2048)return res.status(400).json({error:'invalid_body'});
 const action=Object.hasOwn(ACTIONS,body.action)?ACTIONS[body.action]:null;
 if(!action)return res.status(400).json({error:'unknown_action'});
 const ua=typeof req.headers?.['user-agent']==='string'?req.headers['user-agent'].slice(0,256):undefined;
 const ctx={env,fetcher,target,gate:g,auth:g.auth,origin:g.origin,userAgent:ua};
 try{const r=await action(req,ctx,res);return res.status(r.status).json(r.body)}
 catch(e){if(e.error)return res.status(e.status).json({error:e.error});return res.status(503).json({error:'auth_unavailable'})}
}
module.exports={handleTestAccount,gate,deviceLabel};
