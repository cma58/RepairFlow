// Session introspection through the first-party HttpOnly cookie.
// No database records or privileges are exposed by this endpoint.
// POST is the preview-only owner test login (lib/test-account-login.js); on every
// other deployment it keeps answering 405. It shares this function so the Vercel
// Hobby limit of 12 functions is not exceeded.
import sessionTools from '../../lib/neon-auth-session.js';
import testDepsModule from '../../lib/test-deps.js';
import testAccount from '../../lib/test-account-login.js';
const {sessionCookie,verifySession}=sessionTools;
export default async function handler(req,res,injected){const deps=testDepsModule.testDeps(injected);
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='POST')return testAccount.handleTestAccount(req,res,deps?{env:deps.env,fetcher:deps.fetcher,target:deps.testAccountTarget}:undefined);
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'})}
 if(!sessionCookie(req.headers.cookie))return res.status(401).json({authenticated:false,reason:'no_session_cookie'});
 try{
  await verifySession(req.headers.cookie,deps?{env:deps.env,fetcher:deps.fetcher}:undefined);
  // Identity is confirmed by Neon, but RepairFlow staff authorization is separate.
  return res.status(200).json({authenticated:true,authorized:false,reason:'staff_authorization_pending'});
 }catch(e){return res.status(e.message==='UNAUTHORIZED'?401:503).json({authenticated:false,reason:e.message==='UNAUTHORIZED'?'session_rejected':'auth_provider_unavailable'})}
}
