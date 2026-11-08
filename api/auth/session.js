// Session introspection through the first-party HttpOnly cookie.
// No database records or privileges are exposed by this endpoint.
import sessionTools from '../../lib/neon-auth-session.js';
const {sessionCookie,verifySession}=sessionTools;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'})}
 if(!sessionCookie(req.headers.cookie))return res.status(401).json({authenticated:false,reason:'no_session_cookie'});
 try{
  await verifySession(req.headers.cookie);
  // Identity is confirmed by Neon, but RepairFlow staff authorization is separate.
  return res.status(200).json({authenticated:true,authorized:false,reason:'staff_authorization_pending'});
 }catch(e){return res.status(e.message==='UNAUTHORIZED'?401:503).json({authenticated:false,reason:e.message==='UNAUTHORIZED'?'session_rejected':'auth_provider_unavailable'})}
}
