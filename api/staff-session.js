'use strict';
const {verifyStaffIdentity,getConfig}=require('../lib/neon-auth-identity');
const {verifySession,sessionCookie,authUrl}=require('../lib/neon-auth-session');
const {resolveStaff}=require('../lib/staff-access');
const {Pool}=require('@neondatabase/serverless');
// No customer or POS data returned. Database RLS stays default-deny.
async function staffSessionHandler(req,res,{env=process.env,authenticate,createPool}={}){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 const viaCookie=!!sessionCookie(req.headers?.cookie);
 // A valid first-party cookie or verified bearer token is required.
 try{if(!viaCookie&&getConfig(env).issuer!==authUrl(env))throw Error('AUTH_BRANCH_MISMATCH');}
 catch{return res.status(503).json({error:'Medewerkersportaal nog niet geactiveerd'});}
 let identity;
 try{identity=authenticate?await authenticate(req):viaCookie?await verifySession(req.headers.cookie,{env}):await verifyStaffIdentity(req.headers?.authorization,{env});}
 catch{return res.status(401).json({error:'Aanmelden vereist'});}
 const organizationId=env.REPAIRFLOW_ORGANIZATION_ID;
 const branchId=env.REPAIRFLOW_BRANCH_ID;
 const dbUrl=env.REPAIRFLOW_RUNTIME_DATABASE_URL;
 if(!organizationId||!branchId||!dbUrl||env.REPAIRFLOW_RUNTIME_ROLE!=='rf_runtime')return res.status(503).json({error:'Medewerkersportaal nog niet geactiveerd'});
 const pool=createPool?createPool(dbUrl):new Pool({connectionString:dbUrl,max:1,connectionTimeoutMillis:3000});
 let client;
 try{
  client=await pool.connect();
  await client.query('BEGIN');
  const role=await client.query('SELECT current_user AS name, r.rolbypassrls AS bypass FROM pg_roles r WHERE r.rolname=current_user');
  if(role.rows?.length!==1||role.rows[0].name!=='rf_runtime'||role.rows[0].bypass!==false)throw Error('UNSAFE_RUNTIME_ROLE');
  await client.query("SELECT set_config('app.subject',$1,true),set_config('app.organization_id',$2,true),set_config('app.branch_id',$3,true)",[identity.subject,organizationId,branchId]);
  const staff=await resolveStaff({
   verifiedSubject:identity.subject,organizationId,branchId,
   query:(sql,params)=>client.query(sql,params)
  });
  await client.query('COMMIT');
  return res.status(200).json({authenticated:true,role:staff.role});
 }catch(error){
  if(client)await client.query('ROLLBACK').catch(()=>{});
  if(error.code==='ACCESS_DENIED')return res.status(403).json({error:'Geen toegang tot deze winkel'});
  return res.status(503).json({error:'Tijdelijk niet beschikbaar'});
 }finally{client?.release();await pool.end().catch(()=>{});}
}
module.exports=staffSessionHandler;
module.exports.staffSessionHandler=staffSessionHandler;
