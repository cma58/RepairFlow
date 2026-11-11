'use strict';
// Read-only operational probe. Never exposes credentials, tenant data, or SQL errors.
// Uses the restricted runtime connection when configured (lib/health-database.js).
const {healthDatabaseUrl}=require('../lib/health-database');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({status:'method_not_allowed'});}
 const url=healthDatabaseUrl(process.env);
 if(!url)return res.status(503).json({status:'unavailable'});
 try{
  const {neon}=require('@neondatabase/serverless');
  const sql=neon(url);
  const rows=await sql`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity)::int AS protected
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'rf_%'`;
  const schemaOk=rows[0]?.total===15&&rows[0]?.protected===15;
  // A correct schema alone does NOT mean application authentication and RLS policies are ready.
  return res.status(503).json({status:schemaOk?'schema_installed_access_disabled':'unavailable'});
 }catch(_){return res.status(503).json({status:'unavailable'});}
};