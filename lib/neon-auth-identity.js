'use strict';
// Verify Neon Auth JWTs before any database staff lookup. No trust in client-supplied identity.
const JWKS_CACHE=new Map();
function authError(){const e=new Error('UNAUTHORIZED');e.code='UNAUTHORIZED';return e;}
function parseBearer(value){
 if(typeof value!=='string'||value.length>8192||!/^Bearer [A-Za-z0-9._~+/-]+={0,2}$/.test(value))throw authError();
 return value.slice(7);
}
function getConfig(env){
 const issuer=env.NEON_AUTH_ISSUER;
 const audience=env.NEON_AUTH_AUDIENCE;
 const jwksUrl=env.NEON_AUTH_JWKS_URL;
 if(!issuer||!audience||!jwksUrl)throw new Error('AUTH_NOT_CONFIGURED');
 let parsed,issuerUrl;
 try{parsed=new URL(jwksUrl);issuerUrl=new URL(issuer);}catch{throw new Error('AUTH_NOT_CONFIGURED');}
 if(parsed.protocol!=='https:'||issuerUrl.protocol!=='https:'||parsed.username||parsed.password||issuerUrl.username||issuerUrl.password)throw new Error('AUTH_NOT_CONFIGURED');
 // JWKS must be hosted by the same trusted Neon Auth origin.
 if(parsed.origin!==issuerUrl.origin||!parsed.pathname.endsWith('/.well-known/jwks.json'))throw new Error('AUTH_NOT_CONFIGURED');
 return {issuer,audience,jwksUrl};
}
async function verifyStaffIdentity(header,{env=process.env,verify,jwksFactory}={}){
 const token=parseBearer(header);
 const {issuer,audience,jwksUrl}=getConfig(env);
 // jose is ESM-only in Vercel's Node runtime; keep the CommonJS API boundary.
 if(!verify||!jwksFactory){const jose=await import('jose');verify??=jose.jwtVerify;jwksFactory??=jose.createRemoteJWKSet;}
 let jwks=JWKS_CACHE.get(jwksUrl);
 if(!jwks){jwks=jwksFactory(new URL(jwksUrl));JWKS_CACHE.set(jwksUrl,jwks);}
 try{
  const {payload}=await verify(token,jwks,{issuer,audience,algorithms:['RS256','ES256','EdDSA'],clockTolerance:5});
  if(typeof payload.sub!=='string'||!payload.sub.trim()||payload.sub.length>255||payload.email_verified!==true)throw authError();
  return Object.freeze({subject:payload.sub});
 }catch{throw authError();}
}
module.exports={parseBearer,getConfig,verifyStaffIdentity};
