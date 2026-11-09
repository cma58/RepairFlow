'use strict';
// Branch-scoped operational allowlist until invitations are backed by memberships.
function invited(email,env=process.env){
 if(typeof email!=='string'||!email.trim()||email.length>254)return false;
 const raw=env.REPAIRFLOW_LOGIN_INVITED_EMAILS;
 if(typeof raw!=='string'||raw.length>5000)return false;
 return raw.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}
async function pendingInvitation(email,env=process.env,{createPool}={}){
 if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||
 env.REPAIRFLOW_RUNTIME_ROLE!=='rf_runtime_login'||!env.REPAIRFLOW_RUNTIME_DATABASE_URL)return false;
 const {Pool}=require('@neondatabase/serverless');
 const pool=createPool?createPool(env.REPAIRFLOW_RUNTIME_DATABASE_URL):new Pool({connectionString:env.REPAIRFLOW_RUNTIME_DATABASE_URL,max:1,connectionTimeoutMillis:3000});
 let db;
 try{db=await pool.connect();const role=await db.query('SELECT current_user AS name, r.rolbypassrls AS bypass FROM pg_roles r WHERE r.rolname=current_user');
 if(role.rows?.length!==1||role.rows[0].name!=='rf_runtime_login'||role.rows[0].bypass!==false)return false;
 const r=await db.query('SELECT public.rf_pending_login_invitation($1) AS pending',[email.toLowerCase()]);return r.rows?.[0]?.pending===true;
 }catch{return false}finally{db?.release();await pool.end().catch(()=>{})}
}
module.exports={invited,pendingInvitation};
