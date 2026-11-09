'use strict';
// Keep the branch-specific managed Auth endpoint on the server. A magic link or
// a cookie by itself never grants application privileges.
const COOKIE_NAME=/^(?:__Secure-|__Host-)?(?:better-auth|neon-auth)\.session_token$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SESSION_MS=12*60*60*1000;
function authUrl(env=process.env){
 const raw=env.REPAIRFLOW_NEON_AUTH_URL||env.DATABASE_NEON_AUTH_BASE_URL;
 if(typeof raw!=='string')throw Error('AUTH_NOT_CONFIGURED');
 const url=new URL(raw);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.endsWith('.neon.tech')||!url.pathname.endsWith('/auth'))throw Error('AUTH_NOT_CONFIGURED');
 return url.href.replace(/\/$/,'');
}
function appOrigin(env=process.env){
 const raw=env.REPAIRFLOW_APP_ORIGIN||(env.VERCEL_URL?'https://'+env.VERCEL_URL:null);
 if(typeof raw!=='string')throw Error('AUTH_NOT_CONFIGURED');
 const url=new URL(raw);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('AUTH_NOT_CONFIGURED');
 return url.origin;
}
function sessionCookie(raw){
 if(typeof raw!=='string'||raw.length>8192)return null;
 const matches=raw.split(';').map(x=>x.trim()).filter(x=>COOKIE_NAME.test(x.split('=',1)[0])&&/^[^=]+=[A-Za-z0-9._~+/%-]+={0,2}$/.test(x));
 return matches.length===1?matches[0]:null;
}
function forwardedCookie(raw){
 const pair=typeof raw==='string'?raw.split(';',1)[0].trim():'';
 if(!COOKIE_NAME.test(pair.split('=',1)[0])||!sessionCookie(pair))return null;
 return pair+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200';
}
async function verifySession(raw,{env=process.env,fetcher=fetch}={}){
 const cookie=sessionCookie(raw);if(!cookie)throw Error('UNAUTHORIZED');
 const upstream=await fetcher(authUrl(env)+'/get-session',{headers:{Cookie:cookie,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)});
 if(!upstream.ok)throw Error('UNAUTHORIZED');
 const result=await upstream.json();
 const subject=result?.user?.id;
 if(typeof subject!=='string'||!subject.trim()||subject.length>255||!result?.session)throw Error('UNAUTHORIZED');
 const expiry=Date.parse(result.session.expiresAt),created=Date.parse(result.session.createdAt),id=result.session.id;
 if(!UUID.test(id)||!Number.isFinite(expiry)||expiry<=Date.now()||!Number.isFinite(created)||created>Date.now()+60000||Date.now()-created>=MAX_SESSION_MS)throw Error('UNAUTHORIZED');
 return Object.freeze({subject,sessionId:id,createdAt:result.session.createdAt});
}
module.exports={authUrl,appOrigin,sessionCookie,forwardedCookie,verifySession};
