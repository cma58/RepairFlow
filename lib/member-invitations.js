'use strict';
const crypto=require('node:crypto');const {Pool}=require('@neondatabase/serverless');
const {verifySession,sessionCookie,appOrigin}=require('./neon-auth-session');
const {requestedContext,authorizeContext}=require('./workspace-context');
const {resolveStaff}=require('./staff-access');const {requireManagementStepUp}=require('./webauthn-step-up');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function hashToken(token){return crypto.createHash('sha256').update(token).digest('hex')}
async function memberInvitations(req,res,{env=process.env,authenticate=verifySession,createPool}={}){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 let origin;try{origin=appOrigin(env)}catch{return res.status(503).json({error:'unavailable'})}
 if(req.headers?.origin!==origin)return res.status(403).json({error:'origin_denied'});
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return res.status(415).json({error:'json_required'});
 if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||JSON.stringify(req.body).length>1500)return res.status(400).json({error:'invalid_input'});
 const {action}=req.body;
 if(!['issue','accept','revoke'].includes(action))return res.status(400).json({error:'invalid_input'});
 if(action==='issue'&&(!UUID.test(req.body.branchId)||!['manager','technician','sales'].includes(req.body.role)||
  typeof req.body.email!=='string'||!/^\S+@\S+\.\S+$/.test(req.body.email.trim())||req.body.email.length>254))return res.status(400).json({error:'invalid_input'});
 if(action==='accept'&&(typeof req.body.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(req.body.token)))return res.status(400).json({error:'invalid_input'});
 if(action==='revoke'&&(!UUID.test(req.body.id)||typeof req.body.reason!=='string'||req.body.reason.trim().length<10||req.body.reason.length>500))return res.status(400).json({error:'invalid_input'});
 if(!sessionCookie(req.headers?.cookie))return res.status(401).json({error:'authentication_required'});
 let identity,context;
 try{identity=await authenticate(req.headers.cookie,{env});if(action!=='accept')context=requestedContext(req,env)}catch{return res.status(401).json({error:'authentication_required'})}
 if(env.REPAIRFLOW_RUNTIME_ROLE!=='rf_runtime_login'||!env.REPAIRFLOW_RUNTIME_DATABASE_URL)return res.status(503).json({error:'unavailable'});
 if(action!=='accept'&&(!context.organizationId||!context.branchId))return res.status(503).json({error:'unavailable'});
 const pool=createPool?createPool(env.REPAIRFLOW_RUNTIME_DATABASE_URL):new Pool({connectionString:env.REPAIRFLOW_RUNTIME_DATABASE_URL,max:1,connectionTimeoutMillis:3000});
 let db,started=false;
 try{
  db=await pool.connect();await db.query('BEGIN');started=true;
  const role=await db.query('SELECT current_user AS name, r.rolbypassrls AS bypass FROM pg_roles r WHERE r.rolname=current_user');
  if(role.rows?.length!==1||role.rows[0].name!=='rf_runtime_login'||role.rows[0].bypass!==false)throw Error('UNSAFE_RUNTIME_ROLE');
  await db.query("SELECT set_config('app.subject',$1,true),set_config('app.session_id',$2,true),set_config('app.session_created_at',$3,true)",
   [identity.subject,identity.sessionId,identity.createdAt]);
  let result;
  if(action==='accept'){
   result=await db.query('SELECT organization_id,branch_id FROM public.rf_accept_member_invitation($1)',[hashToken(req.body.token)]);
   if(result.rows.length!==1)throw Error('ACCESS_DENIED');
  }else{
   await db.query("SELECT set_config('app.organization_id',$1,true),set_config('app.branch_id',$2,true)",[context.organizationId,context.branchId]);
   const staff=context.dynamic?await authorizeContext(db,identity.subject,context):await resolveStaff({verifiedSubject:identity.subject,organizationId:context.organizationId,branchId:context.branchId,query:(sql,params)=>db.query(sql,params)});
   if(staff.role!=='owner')throw Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED'});
   await requireManagementStepUp(db,identity,context.organizationId,'invitation.manage');
   if(action==='issue'){
    const token=crypto.randomBytes(32).toString('base64url');
    result=await db.query('SELECT public.rf_issue_member_invitation($1,$2,$3,$4) AS id',
     [req.body.branchId,req.body.email.trim().toLowerCase(),req.body.role,hashToken(token)]);
    await db.query('COMMIT');started=false;
    return res.status(201).json({id:result.rows[0].id,expiresInSeconds:172800,acceptURL:origin+'/accept-invitation.html#token='+token});
   }
   result=await db.query('SELECT public.rf_revoke_member_invitation($1,$2) AS revoked',[req.body.id,req.body.reason.trim()]);
  }
  await db.query('COMMIT');started=false;
  return res.status(200).json(action==='accept'?{accepted:true,organizationId:result.rows[0].organization_id,branchId:result.rows[0].branch_id}:{revoked:true});
 }catch(e){if(started&&db)await db.query('ROLLBACK').catch(()=>{});
  if(e.code==='STEP_UP_REQUIRED'||(e.code==='42501'&&/STEP_UP_REQUIRED/.test(e.message)))return res.status(403).json({error:'step_up_required'});
  if(e.code==='ACCESS_DENIED'||e.code==='42501')return res.status(403).json({error:'access_denied'});
  if(e.code==='23505')return res.status(409).json({error:'conflict'});
  return res.status(503).json({error:'unavailable'});
 }finally{db?.release();await pool.end().catch(()=>{})}
}
module.exports={memberInvitations,hashToken};
