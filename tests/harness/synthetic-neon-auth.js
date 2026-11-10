'use strict';
// SYNTHETIC stand-in for the managed Neon Auth (Better Auth) session endpoints.
// It reproduces only the response shape that lib/neon-auth-session.js consumes:
//   GET  <authUrl>/get-session  (Cookie: __Secure-neon-auth.session_token=...)
//   POST <authUrl>/sign-out
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
function jsonResponse(status,body){return {ok:status>=200&&status<300,status,headers:{getSetCookie:()=>[]},json:async()=>body}}

function createSyntheticNeonAuth(ownerUrl){
 const calls=[];
 async function q(sql,params){const c=new Client({connectionString:ownerUrl});await c.connect();try{return await c.query(sql,params)}finally{await c.end()}}
 async function fetcher(url,init={}){
  const u=new URL(url);
  if(u.origin+u.pathname.replace(/\/(get-session|sign-out)$/,'')!==AUTH_URL)throw Error('synthetic auth: unexpected host '+u.origin);
  const cookie=init.headers?.Cookie||init.headers?.cookie||'';
  const token=tokenFrom(cookie);calls.push({path:u.pathname,hasToken:!!token});
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
 return {AUTH_URL,COOKIE,fetcher,createSession,calls};
}
module.exports={createSyntheticNeonAuth,AUTH_URL,COOKIE};
