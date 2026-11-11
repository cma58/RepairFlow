'use strict';
// SYNTHETIC stand-in for the managed Neon Auth (Better Auth) session endpoints.
// It reproduces only the response shape that lib/neon-auth-session.js consumes:
//   GET  <authUrl>/get-session  (Cookie: __Secure-neon-auth.session_token=...)
//   POST <authUrl>/sign-out
// plus, for the preview-only test-account page (lib/test-account-login.js), the
// email-OTP password reset/verification, email/password sign-in and session list/
// revocation endpoints. One-time codes go to an in-memory OUTBOX that the test reads
// (standing in for the mailbox). Passwords are kept as scrypt hashes in memory.
// Sessions live in the isolated neon_auth.session table of the local cluster.
// This proves RepairFlow's handling of provider responses, NOT the real provider.
const crypto=require('node:crypto');
const {Client}=require('pg');

const AUTH_URL='https://ep-phixar-e2e-synthetic.neonauth.c-0.eu-central-1.aws.neon.tech/neondb/auth';
const COOKIE='__Secure-neon-auth.session_token';

function tokenFrom(cookieHeader){
 const m=/(?:^|;\s*)(?:__Secure-|__Host-)?(?:better-auth|neon-auth)\.session_token=([A-Za-z0-9._~+/%-]+={0,2})/.exec(cookieHeader||'');
 return m?m[1]:null;
}
function jsonResponse(status,body,cookies=[]){return {ok:status>=200&&status<300,status,headers:{getSetCookie:()=>cookies},json:async()=>body}}
const ENDPOINTS=/\/(get-session|sign-out|sign-in\/email|forget-password\/email-otp|email-otp\/reset-password|email-otp\/send-verification-otp|email-otp\/verify-email|list-sessions|revoke-other-sessions)$/;

function createSyntheticNeonAuth(ownerUrl){
 const calls=[],outbox=[],passwords=new Map(),agents=new Map(),otps=new Map();
 const hash=(pw,salt=crypto.randomBytes(16))=>({salt,key:crypto.scryptSync(pw,salt,32)});
 function issueOtp(email,type){const code=String(crypto.randomInt(0,1e6)).padStart(6,'0');otps.set(type+':'+email,{code,expires:Date.now()+300000,attempts:0});outbox.push({to:email,type,code});}
 function takeOtp(email,type,code){const k=type+':'+email,o=otps.get(k);if(!o||o.expires<Date.now())return 'OTP_EXPIRED';if(o.code!==code){if(++o.attempts>=3){otps.delete(k);return 'TOO_MANY_ATTEMPTS'}return 'INVALID_OTP'}otps.delete(k);return null}
 async function userByEmail(email){return (await q('SELECT id,email,"emailVerified",banned FROM neon_auth."user" WHERE lower(email)=lower($1)',[email])).rows[0]}
 async function q(sql,params){const c=new Client({connectionString:ownerUrl});await c.connect();try{return await c.query(sql,params)}finally{await c.end()}}
 async function fetcher(url,init={}){
  const u=new URL(url);
  if(u.origin+u.pathname.replace(ENDPOINTS,'')!==AUTH_URL)throw Error('synthetic auth: unexpected host '+u.origin);
  const cookie=init.headers?.Cookie||init.headers?.cookie||'';
  const token=tokenFrom(cookie);calls.push({path:u.pathname,hasToken:!!token,origin:init.headers?.Origin||null,hasBody:!!init.body});
  const body=init.body?JSON.parse(init.body):{};
  const route=u.pathname.slice(AUTH_URL.length-new URL(AUTH_URL).origin.length);
  if(route==='/forget-password/email-otp'){const user=await userByEmail(body.email);if(user)issueOtp(user.email,'forget-password');return jsonResponse(200,{success:true})}
  if(route==='/email-otp/send-verification-otp'){const user=await userByEmail(body.email);if(user&&!user.emailVerified)issueOtp(user.email,'email-verification');return jsonResponse(200,{success:true})}
  if(route==='/email-otp/reset-password'){
   const user=await userByEmail(body.email);if(!user)return jsonResponse(400,{code:'INVALID_OTP'});
   const err=takeOtp(user.email,'forget-password',body.otp);if(err)return jsonResponse(400,{code:err});
   if(typeof body.password!=='string'||body.password.length<8)return jsonResponse(400,{code:'PASSWORD_TOO_SHORT'});
   passwords.set(user.id,hash(body.password));await q('DELETE FROM neon_auth.session WHERE "userId"=$1',[user.id]);// revoke_sessions_on_password_reset
   return jsonResponse(200,{success:true});
  }
  if(route==='/email-otp/verify-email'){
   const user=await userByEmail(body.email);const err=user?takeOtp(user.email,'email-verification',body.otp):'INVALID_OTP';if(err)return jsonResponse(400,{code:err});
   await q('UPDATE neon_auth."user" SET "emailVerified"=true WHERE id=$1',[user.id]);return jsonResponse(200,{status:true,user:{id:user.id}});
  }
  if(route==='/sign-in/email'){
   const user=await userByEmail(body.email),stored=user&&passwords.get(user.id);
   const ok=stored&&typeof body.password==='string'&&crypto.timingSafeEqual(hash(body.password,stored.salt).key,stored.key);
   if(!ok||user.banned)return jsonResponse(401,{code:'INVALID_EMAIL_OR_PASSWORD'});
   if(!user.emailVerified){issueOtp(user.email,'email-verification');return jsonResponse(403,{code:'EMAIL_NOT_VERIFIED'})}
   const s=await createSession(user.id);agents.set(s.token,init.headers?.['User-Agent']||null);
   return jsonResponse(200,{redirect:false,token:s.token,user:{id:user.id,email:user.email}},[COOKIE+'='+s.token+'; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=None','__Secure-neon-auth.session_data=synthetic-cache; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=None']);
  }
  if(route==='/list-sessions'||route==='/revoke-other-sessions'){
   const me=token&&(await q('SELECT "userId" FROM neon_auth.session WHERE token=$1 AND "expiresAt">now()',[token])).rows[0];
   if(!me)return jsonResponse(401,null);
   if(route==='/revoke-other-sessions'){await q('DELETE FROM neon_auth.session WHERE "userId"=$1 AND token<>$2',[me.userId,token]);return jsonResponse(200,{status:true})}
   const rows=(await q('SELECT id,token,"createdAt","expiresAt" FROM neon_auth.session WHERE "userId"=$1 AND "expiresAt">now() ORDER BY "createdAt"',[me.userId])).rows;
   return jsonResponse(200,rows.map(r=>({id:r.id,token:r.token,userId:me.userId,ipAddress:'192.0.2.1',userAgent:agents.get(r.token)||null,createdAt:r.createdAt.toISOString(),updatedAt:r.createdAt.toISOString(),expiresAt:r.expiresAt.toISOString()})));
  }
  if(u.pathname.endsWith('/get-session')){
   if(!token)return jsonResponse(401,null);
   const r=await q(`SELECT s.id,s."createdAt",s."expiresAt",u.id AS user_id,u.email,u."emailVerified",u.banned
    FROM neon_auth.session s JOIN neon_auth."user" u ON u.id=s."userId" WHERE s.token=$1 AND s."expiresAt">now()`,[token]);
   if(r.rows.length!==1||r.rows[0].banned)return jsonResponse(401,null);
   const s=r.rows[0];
   return jsonResponse(200,{session:{id:s.id,userId:s.user_id,createdAt:s.createdAt.toISOString(),expiresAt:s.expiresAt.toISOString()},user:{id:s.user_id,email:s.email,emailVerified:s.emailVerified}});
  }
  if(u.pathname.endsWith('/sign-out')&&init.method==='POST'){
   if(token)await q('DELETE FROM neon_auth.session WHERE token=$1',[token]);
   return jsonResponse(200,{success:true});
  }
  return jsonResponse(404,null);
 }
 // Simulates the state after a completed primary Neon Auth login for a synthetic
 // user. ageSeconds back-dates the session to test MFA re-login windows.
 async function createSession(userId,{ageSeconds=0,ttlSeconds=7*24*3600}={}){
  const token=crypto.randomBytes(32).toString('base64url');
  const r=await q(`INSERT INTO neon_auth.session(token,"userId","createdAt","expiresAt")
   VALUES($1,$2,now()-make_interval(secs=>$3),now()+make_interval(secs=>$4)) RETURNING id`,[token,userId,ageSeconds,ttlSeconds]);
  return {token,sessionId:r.rows[0].id,cookie:`${COOKIE}=${token}`};
 }
 async function setPassword(userId,password){passwords.set(userId,hash(password))}
 return {AUTH_URL,COOKIE,fetcher,createSession,setPassword,calls,outbox};
}
module.exports={createSyntheticNeonAuth,AUTH_URL,COOKIE};
