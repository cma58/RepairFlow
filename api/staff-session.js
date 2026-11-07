'use strict';
const {verifyStaffIdentity}=require('../lib/neon-auth-identity');
const {resolveStaff}=require('../lib/staff-access');
const {Pool}=require('@neondatabase/serverless');
// No customer or POS data returned. Database RLS stays default-deny.
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 let identity;
 try{identity=await verifyStaffIdentity(req.headers?.authorization);}
 catch{return res.status(401).json({error:'Aanmelden vereist'});}
 const organizationId=process.env.REPAIRFLOW_ORGANIZATION_ID;
 const branchId=process.env.REPAIRFLOW_BRANCH_ID;
 const dbUrl=process.env.REPAIRFLOW_RUNTIME_DATABASE_URL;
 if(!organizationId||!branchId||!dbUrl)return res.status(503).json({error:'Medewerkersportaal nog niet geactiveerd'});
 const pool=new Pool({connectionString:dbUrl,max:1,connectionTimeoutMillis:3000});
 try{
  const staff=await resolveStaff({
   verifiedSubject:identity.subject,organizationId,branchId,
   query:(sql,params)=>pool.query(sql,params)
  });
  return res.status(200).json({authenticated:true,role:staff.role});
 }catch(error){
  if(error.code==='ACCESS_DENIED')return res.status(403).json({error:'Geen toegang tot deze winkel'});
  return res.status(503).json({error:'Tijdelijk niet beschikbaar'});
 }finally{await pool.end().catch(()=>{});}
};
