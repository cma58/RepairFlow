'use strict';
const {sessionCookie,verifySession,authUrl,appOrigin}=require('./neon-auth-session');
async function logout(req,res,{env=process.env,authenticate=verifySession,fetcher=fetch}={}){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 let origin,url;try{origin=appOrigin(env);url=authUrl(env)}catch{return res.status(503).json({error:'auth_unavailable'})}
 if(req.headers?.origin!==origin)return res.status(403).json({error:'origin_denied'});
 const cookie=sessionCookie(req.headers?.cookie);if(!cookie)return res.status(401).json({error:'authentication_required'});
 try{await authenticate(req.headers.cookie,{env,fetcher});const upstream=await fetcher(url+'/sign-out',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json',Accept:'application/json'},body:'{}',redirect:'manual',signal:AbortSignal.timeout(8000)});if(!upstream.ok)throw Error('AUTH_UNAVAILABLE');
  const name=cookie.split('=',1)[0];res.setHeader('Set-Cookie',name+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');return res.status(200).json({signedOut:true});
 }catch{return res.status(503).json({error:'auth_unavailable'})}
}
module.exports={logout};
