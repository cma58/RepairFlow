'use strict';
const {Pool}=require('@neondatabase/serverless');
const {verifySession,sessionCookie}=require('./neon-auth-session');
async function contextDiscovery(req,res,{env=process.env,authenticate=verifySession,createPool}={}){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 if(!sessionCookie(req.headers?.cookie))return res.status(401).json({error:'authentication_required'});
 let identity;try{identity=await authenticate(req.headers.cookie,{env})}catch{return res.status(401).json({error:'authentication_required'})}
 if(env.REPAIRFLOW_DYNAMIC_CONTEXT_ENABLED!=='true')return res.status(200).json({enabled:false,contexts:[]});
 if(env.REPAIRFLOW_RUNTIME_ROLE!=='rf_runtime_login'||!env.REPAIRFLOW_RUNTIME_DATABASE_URL)return res.status(503).json({error:'workspace_unavailable'});
 const pool=createPool?createPool(env.REPAIRFLOW_RUNTIME_DATABASE_URL):new Pool({connectionString:env.REPAIRFLOW_RUNTIME_DATABASE_URL,max:1,connectionTimeoutMillis:3000});
 let client,started=false;
 try{
  client=await pool.connect();await client.query('BEGIN');started=true;
  const role=await client.query('SELECT current_user AS name, r.rolbypassrls AS bypass FROM pg_roles r WHERE r.rolname=current_user');
  if(role.rows?.length!==1||role.rows[0].name!=='rf_runtime_login'||role.rows[0].bypass!==false)throw Error('UNSAFE_RUNTIME_ROLE');
  await client.query("SELECT set_config('app.subject',$1,true)",[identity.subject]);
  const rows=await client.query('SELECT organization_id,organization_name,branch_id,branch_name,base_role FROM public.rf_available_contexts()');
  await client.query('COMMIT');started=false;
  return res.status(200).json({enabled:true,contexts:rows.rows});
 }catch{if(started&&client)await client.query('ROLLBACK').catch(()=>{});return res.status(503).json({error:'workspace_unavailable'})}
 finally{client?.release();await pool.end().catch(()=>{})}
}
module.exports={contextDiscovery};
