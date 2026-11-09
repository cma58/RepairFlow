'use strict';
const {Pool}=require('@neondatabase/serverless');
const {verifySession,sessionCookie,appOrigin}=require('./neon-auth-session');
const {requestedContext,authorizeContext}=require('./workspace-context');
const {resolveStaff}=require('./staff-access');
const {requireManagementStepUp}=require('./webauthn-step-up');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function revokeMemberSession(req,res,{env=process.env,authenticate=verifySession,createPool}={}){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 let origin;try{origin=appOrigin(env)}catch{return res.status(503).json({error:'unavailable'})}
 if(req.headers?.origin!==origin)return res.status(403).json({error:'origin_denied'});
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return res.status(415).json({error:'json_required'});
 const {targetStaffId,sessionId,reason}=req.body||{};
 if(req.body?.action!=='revokeSession')return res.status(400).json({error:'invalid_action'});
 if(!UUID.test(targetStaffId)||!(sessionId===null||UUID.test(sessionId))||typeof reason!=='string'||reason.trim().length<10||reason.length>500)
  return res.status(400).json({error:'invalid_input'});
 if(!sessionCookie(req.headers?.cookie))return res.status(401).json({error:'authentication_required'});
 let identity,context;try{identity=await authenticate(req.headers.cookie,{env});context=requestedContext(req,env)}catch{return res.status(403).json({error:'access_denied'})}
 if(env.REPAIRFLOW_RUNTIME_ROLE!=='rf_runtime_login'||!env.REPAIRFLOW_RUNTIME_DATABASE_URL||!context.organizationId||!context.branchId)return res.status(503).json({error:'unavailable'});
 const pool=createPool?createPool(env.REPAIRFLOW_RUNTIME_DATABASE_URL):new Pool({connectionString:env.REPAIRFLOW_RUNTIME_DATABASE_URL,max:1,connectionTimeoutMillis:3000});
 let db,started=false;
 try{
  db=await pool.connect();await db.query('BEGIN');started=true;
  const role=await db.query('SELECT current_user AS name, r.rolbypassrls AS bypass FROM pg_roles r WHERE r.rolname=current_user');
  if(role.rows?.length!==1||role.rows[0].name!=='rf_runtime_login'||role.rows[0].bypass!==false)throw Error('UNSAFE_RUNTIME_ROLE');
  await db.query("SELECT set_config('app.subject',$1,true),set_config('app.session_id',$2,true),set_config('app.session_created_at',$3,true),set_config('app.organization_id',$4,true),set_config('app.branch_id',$5,true)",
   [identity.subject,identity.sessionId,identity.createdAt,context.organizationId,context.branchId]);
  const staff=context.dynamic?await authorizeContext(db,identity.subject,context):await resolveStaff({verifiedSubject:identity.subject,organizationId:context.organizationId,branchId:context.branchId,query:(sql,params)=>db.query(sql,params)});
  if(staff.role!=='owner')throw Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED'});
  await requireManagementStepUp(db,identity,context.organizationId);
  const result=await db.query('SELECT public.rf_revoke_member_session($1,$2,$3) AS id',[targetStaffId,sessionId,reason.trim()]);
  await db.query('COMMIT');started=false;
  return res.status(200).json({revocationId:result.rows[0].id,scope:'organization_only'});
 }catch(e){if(started&&db)await db.query('ROLLBACK').catch(()=>{});
  if(e.code==='ACCESS_DENIED'||e.code==='42501')return res.status(403).json({error:'access_denied'});
  return res.status(503).json({error:'unavailable'});
 }finally{db?.release();await pool.end().catch(()=>{})}
}
module.exports={revokeMemberSession};
