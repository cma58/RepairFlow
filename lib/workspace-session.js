'use strict';
const {Pool}=require('@neondatabase/serverless');
const {verifySession,appOrigin,sessionCookie}=require('./neon-auth-session');
const {resolveStaff,requireRole}=require('./staff-access');
const {requestedContext,authorizeContext}=require('./workspace-context');
const {requirePermission}=require('./workspace-permissions');

// One transaction owns identity, RLS settings, staff authorization and work.
// Never open a connection with the schema owner in a request handler.
async function withWorkspace(req,res,operation,{env=process.env,authenticate=verifySession,createPool}={}){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'method_not_allowed'});
 if(req.method==='POST'){
  let origin;
  try{origin=appOrigin(env)}catch{return res.status(503).json({error:'workspace_unavailable'})}
  if(req.headers?.origin!==origin)return res.status(403).json({error:'origin_denied'});
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return res.status(415).json({error:'json_required'});
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||JSON.stringify(req.body).length>30000)return res.status(400).json({error:'invalid_body'});
 }
 if(!sessionCookie(req.headers?.cookie))return res.status(401).json({error:'authentication_required'});
 let identity;
 try{identity=await authenticate(req.headers.cookie,{env})}catch{return res.status(401).json({error:'authentication_required'})}
 let context;try{context=requestedContext(req,env)}catch{return res.status(403).json({error:'access_denied'})}
 const {organizationId,branchId}=context;
 if(!organizationId||!branchId||env.REPAIRFLOW_RUNTIME_ROLE!=='rf_runtime_login'||!env.REPAIRFLOW_RUNTIME_DATABASE_URL)
  return res.status(503).json({error:'workspace_unavailable'});
 const pool=createPool?createPool(env.REPAIRFLOW_RUNTIME_DATABASE_URL):new Pool({connectionString:env.REPAIRFLOW_RUNTIME_DATABASE_URL,max:1,connectionTimeoutMillis:3000});
 let client,started=false;
 try{
  client=await pool.connect();
  await client.query('BEGIN');started=true;
  const role=await client.query('SELECT current_user AS name, r.rolbypassrls AS bypass FROM pg_roles r WHERE r.rolname=current_user');
  if(role.rows?.length!==1||role.rows[0].name!=='rf_runtime_login'||role.rows[0].bypass!==false)throw Error('UNSAFE_RUNTIME_ROLE');
  await client.query("SELECT set_config('app.subject',$1,true),set_config('app.organization_id',$2,true),set_config('app.branch_id',$3,true)",[identity.subject,organizationId,branchId]);
  const staff=context.dynamic?await authorizeContext(client,identity.subject,context):await resolveStaff({verifiedSubject:identity.subject,organizationId,branchId,query:(sql,params)=>client.query(sql,params)});
  if(!context.dynamic)requireRole(staff,['owner','manager']);
  requirePermission(staff,req);
  const result=await operation(client,staff,req);
  await client.query('COMMIT');started=false;
  return res.status(result?.status||200).json(result?.body||{});
 }catch(error){
  if(started&&client)await client.query('ROLLBACK').catch(()=>{});
  if(error.code==='ACCESS_DENIED')return res.status(403).json({error:'access_denied'});
  if(error.code==='INVALID_INPUT')return res.status(400).json({error:'invalid_input'});
  if(['VERSION_CONFLICT','APPROVAL_REQUIRED','BALANCE_DUE','DAY_CLOSED'].includes(error.code))return res.status(409).json({error:error.code.toLowerCase()});
  if(error.code==='CONFLICT'||error.code==='23505')return res.status(409).json({error:'conflict'});
  if(error.code==='INSUFFICIENT_STOCK')return res.status(409).json({error:'insufficient_stock'});
  if(error.code==='NOT_FOUND')return res.status(404).json({error:'not_found'});
  return res.status(503).json({error:'workspace_unavailable'});
 }finally{client?.release();await pool.end().catch(()=>{})}
}
module.exports={withWorkspace};
