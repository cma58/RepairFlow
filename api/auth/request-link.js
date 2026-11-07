const AUTH='https://ep-rough-cake-ba03t8v8.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth';
const ORIGIN='https://repair-flow-theta.vercel.app';
const INVITED=new Set(['gihanamarcelin@hotmail.com','amine.chtaiti@gmail.com']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'method_not_allowed'})}
 if(process.env.REPAIRFLOW_AUTH_LOGIN_ENABLED!=='true')return res.status(503).json({error:'login_not_ready'});
 if(req.headers.origin!==ORIGIN)return res.status(403).json({error:'invalid_origin'});
 const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
 if(!INVITED.has(email))return res.status(403).json({error:'account_not_invited'});
 try{
  const upstream=await fetch(AUTH+'/sign-in/magic-link',{method:'POST',headers:{'Content-Type':'application/json','Origin':ORIGIN},body:JSON.stringify({email,callbackURL:ORIGIN+'/api/auth/callback',errorCallbackURL:ORIGIN+'/login.html?error=verification_failed'}),signal:AbortSignal.timeout(8000)});
  if(!upstream.ok)return res.status(502).json({error:'mail_provider_unavailable'});
  return res.status(200).json({sent:true});
 }catch(e){return res.status(503).json({error:'mail_provider_unavailable'})}
}
