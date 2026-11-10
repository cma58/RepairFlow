'use strict';
const {Pool}=require('@neondatabase/serverless');
const {verifySession,sessionCookie,appOrigin}=require('./neon-auth-session');
const {resolveStaff,requireRole}=require('./staff-access');
const {requestedContext,authorizeContext}=require('./workspace-context');
const {begin,finish,relyingParty}=require('./webauthn-step-up');
async function webauthnHandler(req,res,{env=process.env,authenticate=verifySession,createPool,web}={}){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 let origin;
 try{origin=appOrigin(env);relyingParty(env)}catch{return res.status(503).json({error:'webauthn_unavailable'})}
 if(req.headers?.origin!==origin)return res.status(403).json({error:'origin_denied'});
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return res.status(415).json({error:'json_required'});
 if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||JSON.stringify(req.body).length>17000)return res.status(400).json({error:'invalid_input'});
 const action=req.body.action;
 if(!['registrationOptions','registrationVerify','authenticationOptions','authenticationVerify'].includes(action))return res.status(400).json({error:'invalid_input'});
 if(!sessionCookie(req.headers?.cookie))return res.status(401).json({error:'authentication_required'});
 let identity,context;
 try{identity=await authenticate(req.headers.cookie,{env});context=requestedContext(req,env)}catch{return res.status(403).json({error:'access_denied'})}
 if(env.REPAIRFLOW_RUNTIME_ROLE!=='rf_runtime_login'||!env.REPAIRFLOW_RUNTIME_DATABASE_URL||!context.organizationId||!context.branchId)
  return res.status(503).json({error:'webauthn_unavailable'});
 const pool=createPool?createPool(env.REPAIRFLOW_RUNTIME_DATABASE_URL):new Pool({connectionString:env.REPAIRFLOW_RUNTIME_DATABASE_URL,max:1,connectionTimeoutMillis:3000});
 let db,started=false;
 try{
  db=await pool.connect();await db.query('BEGIN');started=true;
  const role=await db.query('SELECT current_user AS name, r.rolbypassrls AS bypass FROM pg_roles r WHERE r.rolname=current_user');
  if(role.rows?.length!==1||role.rows[0].name!=='rf_runtime_login'||role.rows[0].bypass!==false)throw Error('UNSAFE_RUNTIME_ROLE');
  await db.query("SELECT set_config('app.subject',$1,true),set_config('app.session_id',$2,true),set_config('app.session_created_at',$3,true),set_config('app.organization_id',$4,true),set_config('app.branch_id',$5,true)",
   [identity.subject,identity.sessionId,identity.createdAt,context.organizationId,context.branchId]);
  const staff=context.dynamic?await authorizeContext(db,identity.subject,context):await resolveStaff({verifiedSubject:identity.subject,organizationId:context.organizationId,branchId:context.branchId,query:(sql,params)=>db.query(sql,params)});
  requireRole(staff,['owner','manager']);
  const library=web||await import('@simplewebauthn/server');
  const ceremony=action.startsWith('registration')?'registration':'authentication';
  const result=action.endsWith('Options')?await begin(db,identity,context.organizationId,ceremony,env,library,{purpose:req.body.purpose===undefined?'credential.activate':req.body.purpose}):
   await finish(db,identity,context.organizationId,ceremony,req.body,env,library);
  await db.query('COMMIT');started=false;
  return res.status(result.verified===false?400:200).json(result);
 }catch(e){
  if(started&&db)await db.query('ROLLBACK').catch(()=>{});
  if(e.code==='ACCESS_DENIED')return res.status(403).json({error:'access_denied'});
  if(e.code==='RATE_LIMITED')return res.status(429).json({error:'rate_limited'});
  if(e.code==='RECENT_LOGIN_REQUIRED')return res.status(403).json({error:'recent_login_required'});
  if(e.code==='STEP_UP_REQUIRED')return res.status(403).json({error:'step_up_required'});
  if(e.code==='TOO_MANY_PENDING')return res.status(409).json({error:'too_many_pending_credentials'});
  if(e.code==='42501')return res.status(403).json({error:/STEP_UP_REQUIRED/.test(e.message)?'step_up_required':'access_denied'});
  if(['INVALID_INPUT','INVALID_CHALLENGE','NO_CREDENTIAL'].includes(e.code))return res.status(400).json({error:e.code.toLowerCase()});
  if(e.code==='23505')return res.status(409).json({error:'conflict'});
  return res.status(503).json({error:'webauthn_unavailable'});
 }finally{db?.release();await pool.end().catch(()=>{})}
}
module.exports={webauthnHandler};
