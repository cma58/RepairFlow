import { createRemoteJWKSet, jwtVerify } from 'jose';
import { neon } from '@neondatabase/serverless';

const AUTH_BASE='https://ep-rough-cake-ba03t8v8.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth';
const JWKS=createRemoteJWKSet(new URL(AUTH_BASE+'/.well-known/jwks.json'));
const ORIGIN='https://repair-flow-theta.vercel.app';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'auth_not_configured'});
 const origin=req.headers.origin;
 if(origin&&origin!==ORIGIN)return res.status(403).json({error:'origin_denied'});
 const header=req.headers.authorization||'';
 if(!/^Bearer [A-Za-z0-9_.-]+$/.test(header))return res.status(401).json({error:'missing_access_token'});
 try{
  const token=header.slice(7);
  const {payload}=await jwtVerify(token,JWKS,{algorithms:['RS256','ES256','EdDSA'],clockTolerance:5});
  if(typeof payload.sub!=='string'||!payload.sub||payload.email_verified!==true){
   return res.status(401).json({error:'unverified_identity'});
  }
  // Reject tokens minted by any other issuer even if the same signing infrastructure is used.
  if(typeof payload.iss!=='string'||!payload.iss.startsWith(AUTH_BASE)){
   return res.status(401).json({error:'wrong_issuer'});
  }
  const sql=neon(process.env.DATABASE_URL);
  const staff=await sql`SELECT organization_id,branch_id,display_name,role FROM public.rf_staff
   WHERE identity_subject=${payload.sub} AND active=true LIMIT 2`;
  if(staff.length!==1)return res.status(403).json({error:'staff_not_active'});
  const account=staff[0];
  return res.status(200).json({authenticated:true,staff:{displayName:account.display_name,role:account.role,organizationId:account.organization_id,branchId:account.branch_id}});
 }catch(err){
  if(err?.code?.startsWith?.('ERR_JWT')||err?.code?.startsWith?.('ERR_JWS')||err?.code?.startsWith?.('ERR_JOSE')){
   return res.status(401).json({error:'invalid_access_token'});
  }
  return res.status(503).json({error:'auth_temporarily_unavailable'});
 }
}
