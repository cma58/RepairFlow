// Neon Auth magic-link verifier exchange: only on the server, never in localStorage.
import sessionTools from '../../lib/neon-auth-session.js';
const {authUrl,forwardedCookie,verifySession}=sessionTools;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).end();
 const verifier=typeof req.query?.neon_auth_session_verifier==='string'?req.query.neon_auth_session_verifier:'';
 if(!/^ml-[A-Za-z0-9_.-]{10,512}$/.test(verifier))return res.redirect(303,'/login.html?error=invalid_verifier');
 try{
  const url=new URL(authUrl()+'/get-session');
  url.searchParams.set('neon_auth_session_verifier',verifier);
  const upstream=await fetch(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
  if(!upstream.ok)return res.redirect(303,'/login.html?error=exchange_failed');
  const body=await upstream.json();
  if(!body?.session||!body?.user)return res.redirect(303,'/login.html?error=no_session');
  const cookies=upstream.headers.getSetCookie?.()||[];
  const sessionCookies=cookies.map(forwardedCookie).filter(Boolean);
  if(sessionCookies.length!==1)return res.redirect(303,'/login.html?error=cookie_unavailable');
  // The verifier response must also yield a usable session cookie.
  const verified=await verifySession(sessionCookies[0].split(';',1)[0]);
  if(verified.subject!==body.user.id)return res.redirect(303,'/login.html?error=session_mismatch');
  res.setHeader('Set-Cookie',sessionCookies);
  return res.redirect(303,'/login.html?auth_return=1');
 }catch(e){return res.redirect(303,'/login.html?error=exchange_unavailable')}
}
