// Session introspection through the first-party HttpOnly cookie.
// No database records or privileges are exposed by this endpoint.
const AUTH='https://ep-rough-cake-ba03t8v8.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'})}
 const raw=req.headers.cookie||'';
 const cookie=raw.split(';').map(x=>x.trim()).filter(x=>/^(?:__Secure-|__Host-)?(?:better-auth|neon-auth)\.session_token=/.test(x)).join('; ');
 if(!cookie)return res.status(401).json({authenticated:false,reason:'no_session_cookie'});
 try{
  const upstream=await fetch(AUTH+'/get-session',{headers:{Cookie:cookie,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(!upstream.ok)return res.status(401).json({authenticated:false,reason:'session_rejected'});
  const result=await upstream.json();
  if(!result?.session||!result?.user?.id)return res.status(401).json({authenticated:false,reason:'session_missing'});
  // Identity is confirmed by Neon, but RepairFlow staff authorization is separate.
  return res.status(200).json({authenticated:true,authorized:false,reason:'staff_authorization_pending'});
 }catch(e){return res.status(503).json({authenticated:false,reason:'auth_provider_unavailable'})}
}
