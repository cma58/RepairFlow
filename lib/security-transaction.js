'use strict';
// Shared request boundary for security actions: same-origin JSON POST, verified Neon
// Auth cookie session, restricted runtime role, server-side tenant context and staff
// resolution, one transaction with app.* settings. Used by lib/credential-management.js.
const {Pool}=require('@neondatabase/serverless');
const {verifySession,sessionCookie,appOrigin}=require('./neon-auth-session');
const {requestedContext,authorizeContext}=require('./workspace-context');
const {resolveStaff}=require('./staff-access');
const {requireCurrentSession}=require('./session-guard');
function errorResponse(res,e){
 const text=String(e?.message||'');
 if(e?.code==='STEP_UP_REQUIRED'||(e?.code==='42501'&&/STEP_UP_REQUIRED/.test(text)))return res.status(403).json({error:'step_up_required'});
 if(e?.code==='RECENT_LOGIN_REQUIRED'||(e?.code==='42501'&&/RECENT_LOGIN_REQUIRED/.test(text)))return res.status(403).json({error:'recent_login_required'});
 if(e?.code==='ACCESS_DENIED'||e?.code==='42501')return res.status(403).json({error:'access_denied'});
 if(e?.code==='INVALID_INPUT')return res.status(400).json({error:'invalid_input'});
 if(e?.code==='23505')return res.status(409).json({error:'conflict'});
 return res.status(503).json({error:'unavailable'});
}
async function withSecurityTransaction(req,res,{env=process.env,authenticate=verifySession,createPool}={},{roles,maxBody=2000},fn){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 let origin;try{origin=appOrigin(env)}catch{return res.status(503).json({error:'unavailable'})}
 if(req.headers?.origin!==origin)return res.status(403).json({error:'origin_denied'});
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return res.status(415).json({error:'json_required'});
 if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||JSON.stringify(req.body).length>maxBody)return res.status(400).json({error:'invalid_input'});
 if(!sessionCookie(req.headers?.cookie))return res.status(401).json({error:'authentication_required'});
 let identity,context;
 try{identity=await authenticate(req.headers.cookie,{env});context=requestedContext(req,env)}catch{return res.status(401).json({error:'authentication_required'})}
 if(env.REPAIRFLOW_RUNTIME_ROLE!=='rf_runtime_login'||!env.REPAIRFLOW_RUNTIME_DATABASE_URL||!context.organizationId||!context.branchId)return res.status(503).json({error:'unavailable'});
 const pool=createPool?createPool(env.REPAIRFLOW_RUNTIME_DATABASE_URL):new Pool({connectionString:env.REPAIRFLOW_RUNTIME_DATABASE_URL,max:1,connectionTimeoutMillis:3000});
 let db,started=false;
 try{
  db=await pool.connect();await db.query('BEGIN');started=true;
  const role=await db.query('SELECT current_user AS name, r.rolbypassrls AS bypass FROM pg_roles r WHERE r.rolname=current_user');
  if(role.rows?.length!==1||role.rows[0].name!=='rf_runtime_login'||role.rows[0].bypass!==false)throw Error('UNSAFE_RUNTIME_ROLE');
  await db.query("SELECT set_config('app.subject',$1,true),set_config('app.session_id',$2,true),set_config('app.session_created_at',$3,true),set_config('app.organization_id',$4,true),set_config('app.branch_id',$5,true)",
   [identity.subject,identity.sessionId,identity.createdAt,context.organizationId,context.branchId]);
  await requireCurrentSession(db,identity,context.organizationId);
  const staff=context.dynamic?await authorizeContext(db,identity.subject,context):await resolveStaff({verifiedSubject:identity.subject,organizationId:context.organizationId,branchId:context.branchId,query:(sql,params)=>db.query(sql,params)});
  if(!roles.includes(staff.role))throw Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED'});
  const {status=200,body,commit=true}=await fn({db,identity,context,staff,origin});
  await db.query(commit?'COMMIT':'ROLLBACK');started=false;
  return res.status(status).json(body);
 }catch(e){if(started&&db)await db.query('ROLLBACK').catch(()=>{});return errorResponse(res,e)}
 finally{db?.release();await pool.end().catch(()=>{})}
}
module.exports={withSecurityTransaction,errorResponse};
