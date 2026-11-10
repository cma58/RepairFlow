'use strict';
// Real Chromium/Chrome via playwright-core with CDP virtual WebAuthn authenticators.
// Each browserSession() is an independent BrowserContext (separate cookie jar,
// storage and authenticator) — equivalent to a separate browser profile.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const COOKIE='__Secure-neon-auth.session_token';
const ARTIFACTS=path.resolve(__dirname,'..','..','test-results','security-e2e');

function chromePath(){
 const candidates=[process.env.PHIXAR_CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
 return candidates.find(p=>fs.existsSync(p))||null;
}
async function launch(spkiList){
 const executablePath=chromePath();
 if(!executablePath){const e=Error('No Chrome/Chromium executable found; set PHIXAR_CHROME_PATH');e.code='BROWSER_UNAVAILABLE';throw e}
 fs.mkdirSync(ARTIFACTS,{recursive:true});
 // The SPKI pin makes Chrome accept ONLY the harness's ephemeral self-signed
 // certificate as valid (secure context, WebAuthn allowed). No global TLS bypass.
 const browser=await chromium.launch({executablePath,headless:true,args:['--ignore-certificate-errors-spki-list='+spkiList.join(','),'--no-proxy-server']});
 return {browser,version:browser.version(),executablePath};
}
const DEFAULT_AUTHENTICATOR=Object.freeze({protocol:'ctap2',transport:'usb',hasResidentKey:false,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true});
async function browserSession(browser,app,auth,user,{ageSeconds=0,label,authenticator={}}={}){
 const ctx=await browser.newContext();
 await ctx.tracing.start({screenshots:true,snapshots:true});
 const session=await auth.createSession(user.id,{ageSeconds});
 await ctx.addCookies([{name:COOKIE,value:session.token,domain:'localhost',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
 const page=await ctx.newPage();
 const cdp=await ctx.newCDPSession(page);
 await cdp.send('WebAuthn.enable',{enableUI:false});
 const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{...DEFAULT_AUTHENTICATOR,...authenticator}});
 await page.goto(app.origin+'/security');
 const s={ctx,page,cdp,authenticatorId,session,user,app,label:label||user.email};
 // fetch() from inside the real page: same-origin, HttpOnly cookie sent by the browser.
 s.api=(p,body,headers={})=>page.evaluate(async([p,body,headers])=>{
  const r=await fetch(p,body?{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}:{headers});
  let json=null;try{json=await r.json()}catch{}return {status:r.status,body:json};
 },[p,body,headers]);
 s.ceremony=(type,{tamper,purpose,allow}={})=>page.evaluate(async([type,tamper,purpose,allow])=>{
  const post=b=>fetch('/api/security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
  const o=await post({action:type+'Options',...(purpose?{purpose}:{})});const ob=await o.json().catch(()=>null);
  if(!o.ok)return {step:'options',status:o.status,body:ob};
  const {challengeId,options}=ob;
  if(tamper==='challenge')options.challenge=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  // Client-side downgrade attempt: ask the authenticator NOT to verify the user.
  // Force a specific credential the server did not offer (e.g. revoked/blocked key).
  if(allow)options.allowCredentials=allow.map(id=>({id,type:'public-key'}));
  if(tamper==='uv'){options.userVerification='discouraged';if(options.authenticatorSelection)options.authenticatorSelection.userVerification='discouraged'}
  const response=type==='registration'?await SimpleWebAuthnBrowser.startRegistration({optionsJSON:options}):await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:options});
  const payload={action:type+'Verify',challengeId:tamper==='challengeId'?crypto.randomUUID():challengeId,response};
  const v=await post(payload);
  return {step:'verify',status:v.status,body:await v.json().catch(()=>null),payload};
 },[type,tamper||null,purpose||null,allow||null]);
 s.stepUp=async purpose=>{const r=await s.ceremony('authentication',{purpose});if(r.status!==200||r.body?.verified!==true)throw Error('step-up failed: '+JSON.stringify(r));return r.body};
 s.addAuthenticator=async(opts={})=>(await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{...DEFAULT_AUTHENTICATOR,...opts}})).authenticatorId;
 s.replay=payload=>page.evaluate(async payload=>{const r=await fetch('/api/security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return {status:r.status,body:await r.json().catch(()=>null)}},payload);
 s.credentials=async(id=s.authenticatorId)=>(await cdp.send('WebAuthn.getCredentials',{authenticatorId:id})).credentials;
 s.close=async(name)=>{try{await ctx.tracing.stop({path:path.join(ARTIFACTS,(name||s.label).replace(/[^a-z0-9.-]+/gi,'_')+'.trace.zip')})}catch{}await ctx.close()};
 s.screenshot=name=>page.screenshot({path:path.join(ARTIFACTS,name.replace(/[^a-z0-9.-]+/gi,'_')+'.png'),fullPage:true});
 return s;
}
module.exports={launch,browserSession,chromePath,ARTIFACTS};
