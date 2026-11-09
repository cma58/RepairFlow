import sessionTools from '../../lib/neon-auth-session.js';
const {authUrl,appOrigin}=sessionTools;
import invitations from '../../lib/login-invitations.js';
const {invited,pendingInvitation}=invitations;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'method_not_allowed'})}
 if(process.env.REPAIRFLOW_AUTH_LOGIN_ENABLED!=='true'||process.env.REPAIRFLOW_AUTH_EXCHANGE_VERIFIED!=='true'||process.env.REPAIRFLOW_STAFF_AUTHORIZATION_VERIFIED!=='true')return res.status(503).json({error:'login_not_ready'});
 let origin,auth;
 try{origin=appOrigin();auth=authUrl();}catch{return res.status(503).json({error:'login_not_ready'});}
 if(req.headers.origin!==origin)return res.status(403).json({error:'invalid_origin'});
 const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
 if(!invited(email)&&!await pendingInvitation(email))return res.status(403).json({error:'account_not_invited'});
 try{
  const upstream=await fetch(auth+'/sign-in/magic-link',{method:'POST',headers:{'Content-Type':'application/json','Origin':origin},body:JSON.stringify({email,callbackURL:origin+'/api/auth/callback',errorCallbackURL:origin+'/login.html?error=verification_failed'}),signal:AbortSignal.timeout(8000)});
  if(!upstream.ok)return res.status(502).json({error:'mail_provider_unavailable'});
  return res.status(200).json({sent:true});
 }catch(e){return res.status(503).json({error:'mail_provider_unavailable'})}
}
