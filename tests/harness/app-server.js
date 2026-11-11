'use strict';
// Local HTTPS server that executes the REAL Vercel entrypoints in api/ with the
// REAL lib/ handlers. Only three things are substituted, explicitly:
//   1. database transport: pg Pool → isolated local PostgreSQL as rf_runtime_login
//   2. Neon Auth provider: synthetic /get-session + /sign-out (see synthetic-neon-auth.js)
//   3. environment: a frozen synthetic env object (never process.env secrets)
// Magic-link request/callback routes are intentionally NOT mounted: they call the
// real provider over the network and cannot be proven without real Neon Auth access.
const https=require('node:https'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {verifySession}=require('../../lib/neon-auth-session');
const {markTestDeps}=require('../../lib/test-deps');

const ROOT=path.resolve(__dirname,'..','..');
const ROUTES={
 '/api/auth/me':'api/auth/me.js','/api/auth/session':'api/auth/session.js','/api/auth/logout':'api/auth/logout.js',
 '/api/auth/status':'api/auth/status.js','/api/security':'api/security.js','/api/workspace':'api/workspace.js','/api/contexts':'api/contexts.js'
};
const NOT_MOUNTED=new Set(['/api/auth/callback','/api/auth/request-link','/api/customer-status','/api/db-health']);
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};

function selfSignedCertificate(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phixar-tls-'));
 const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');
 execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-nodes','-days','1','-subj','/CN=localhost',
  '-addext','subjectAltName=DNS:localhost','-keyout',key,'-out',cert],{stdio:'pipe'});
 const pem=fs.readFileSync(cert);
 const spki=crypto.createHash('sha256').update(new crypto.X509Certificate(pem).publicKey.export({type:'spki',format:'der'})).digest('base64');
 return {key:fs.readFileSync(key),cert:pem,spki,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}

function vercelLike(req,res,url){
 req.query=Object.fromEntries(url.searchParams);
 res.status=code=>{res.statusCode=code;return res};
 res.json=data=>{if(!res.getHeader('Content-Type'))res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));return res};
 res.send=data=>{res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));return res};
 res.redirect=(a,b)=>{const [code,loc]=typeof a==='number'?[a,b]:[307,a];res.statusCode=code;res.setHeader('Location',loc);res.end();return res};
}
async function readBody(req){
 const chunks=[];let size=0;
 for await(const c of req){size+=c.length;if(size>1e6)throw Object.assign(Error('too large'),{status:413});chunks.push(c)}
 const raw=Buffer.concat(chunks).toString('utf8');
 if(!raw)return undefined;
 if(/^application\/json/i.test(req.headers['content-type']||'')){try{return JSON.parse(raw)}catch{throw Object.assign(Error('Invalid JSON'),{status:400})}}
 return raw;
}
function staticFile(res,pathname){
 let rel=decodeURIComponent(pathname).replace(/^\/+/,'');
 if(rel==='')rel='index.html';
 if(rel.split('/').some(p=>p.startsWith('.')||p==='node_modules'))return false;
 let file=path.join(ROOT,rel);
 if(!file.startsWith(ROOT+path.sep))return false;
 if(!path.extname(file)&&fs.existsSync(file+'.html'))file+='.html';// vercel.json cleanUrls
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())return false;
 res.writeHead(200,{'Content-Type':TYPES[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
 fs.createReadStream(file).pipe(res);return true;
}

// realEnv: run the REAL dependency path (verifySession → real Neon Auth over the
// network, @neondatabase/serverless Pool → real isolated Neon branch). Only env is
// supplied; nothing is substituted. Used by tests/provider (opt-in, needs secrets).
// testAccount: {emailSha256,userId} enables the preview-only test login exactly as on
// the pinned Vercel preview (VERCEL_ENV=preview + P0 branch), pinned to THIS harness.
async function startAppServer({database,auth,organizationId,branchId,dynamicContext=false,port=0,realEnv,testAccount}){
 const tls=selfSignedCertificate();
 const handlers={};
 for(const [route,file] of Object.entries(ROUTES))handlers[route]=(await import(path.join(ROOT,file))).default;
 let origin,deps;
 const server=https.createServer({key:tls.key,cert:tls.cert},async(req,res)=>{
  const url=new URL(req.url,origin);
  try{
   if(NOT_MOUNTED.has(url.pathname)){res.writeHead(501,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'not_available_in_isolated_harness'}))}
   const handler=handlers[url.pathname];
   if(handler){
    vercelLike(req,res,url);
    req.body=await readBody(req);
    return await handler(req,res,deps);
   }
   if(!staticFile(res,url.pathname)){res.writeHead(404);res.end('not found')}
  }catch(e){if(!res.headersSent){res.writeHead(e.status||500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.status?e.message:'harness_error'}))}}
 });
 await new Promise(r=>server.listen(port,'127.0.0.1',r));
 origin='https://localhost:'+server.address().port;
 if(realEnv){const env=Object.freeze({...realEnv,REPAIRFLOW_APP_ORIGIN:origin,REPAIRFLOW_DYNAMIC_CONTEXT_ENABLED:'false'});deps=markTestDeps({env});
  return {origin,spki:tls.spki,cert:tls.cert,env,close:()=>new Promise(r=>{server.closeAllConnections?.();server.close(()=>{tls.cleanup();r()})})}}
 const env=Object.freeze({
  REPAIRFLOW_APP_ORIGIN:origin,REPAIRFLOW_WEBAUTHN_RP_ID:'localhost',REPAIRFLOW_NEON_AUTH_URL:auth.AUTH_URL,
  REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:database.runtimeUrl,
  REPAIRFLOW_ORGANIZATION_ID:organizationId,REPAIRFLOW_BRANCH_ID:branchId,
  REPAIRFLOW_DYNAMIC_CONTEXT_ENABLED:dynamicContext?'true':'false',
  ...(testAccount?{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:require('../../lib/isolated-test-target').GIT_BRANCH,VERCEL_GIT_COMMIT_SHA:'local-harness'}:{})
 });
 let testAccountTarget;
 if(testAccount){const db=new URL(database.runtimeUrl);
  testAccountTarget=Object.freeze({...require('../../lib/isolated-test-target'),AUTH:auth.AUTH_URL,ORIGIN:origin,ORGANIZATION_ID:organizationId,ORGANIZATION_NAME:'E2E Tenant A',BRANCH_ID:branchId,
   DATABASE_HOSTS:[db.hostname],DATABASE_NAME:db.pathname.slice(1),EMAIL_SHA256:testAccount.emailSha256,USER_ID:testAccount.userId})}
 deps=markTestDeps({env,createPool:database.createPool,fetcher:auth.fetcher,testAccountTarget,
  // api/staff-session.js calls authenticate(req); other handlers call authenticate(cookie,{env}).
  authenticate:(arg,opts={})=>verifySession(typeof arg==='object'&&arg?.headers?arg.headers.cookie:arg,{env:opts.env||env,fetcher:auth.fetcher})});
 return {origin,spki:tls.spki,env,close:()=>new Promise(r=>{server.closeAllConnections?.();server.close(()=>{tls.cleanup();r()})})};
}
module.exports={startAppServer};
