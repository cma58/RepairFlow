'use strict';
// Ephemeral, isolated PostgreSQL cluster for security integration and browser E2E.
// - Never connects to Neon, Vercel or any remote database.
// - Applies the repository schema and ALL migrations exactly as committed.
// - Uses a non-superuser BYPASSRLS schema owner (like Neon's neondb_owner) and the
//   real restricted runtime role rf_runtime_login (NOBYPASSRLS) for app traffic.
// - neon_auth is a minimal synthetic stand-in for the managed Better Auth schema;
//   it is NOT the real Neon Auth provider.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {execFileSync,spawnSync}=require('node:child_process');
const {Client,Pool}=require('pg');

const ROOT=path.resolve(__dirname,'..','..');
const SCHEMA_FILES=['db/schema-v0.1.sql','db/schema-v0.2-pos.sql','db/schema-v0.3-pos-idempotency.sql'];

function pgBin(){
 if(process.env.PHIXAR_PG_BIN)return process.env.PHIXAR_PG_BIN;
 const base='/usr/lib/postgresql';
 if(fs.existsSync(base)){
  const versions=fs.readdirSync(base).filter(v=>/^\d+$/.test(v)&&fs.existsSync(path.join(base,v,'bin','initdb'))).sort((a,b)=>b-a);
  if(versions.length)return path.join(base,versions[0],'bin');
 }
 const found=spawnSync('sh',['-c','command -v initdb'],{encoding:'utf8'}).stdout.trim();
 if(found)return path.dirname(found);
 return null;
}
function migrationFiles(){
 return fs.readdirSync(path.join(ROOT,'db','migrations')).filter(f=>/^\d{3}-.*\.sql$/.test(f)).sort().map(f=>path.join('db','migrations',f));
}
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port))})})}
function asPostgresUser(){return typeof process.getuid==='function'&&process.getuid()===0}
function run(bin,args,opts={}){
 const cmd=path.join(bin,args[0]);
 if(asPostgresUser())return execFileSync('runuser',['-u','postgres','--',cmd,...args.slice(1)],{stdio:'pipe',...opts});
 return execFileSync(cmd,args.slice(1),{stdio:'pipe',...opts});
}

async function startCluster(){
 const bin=pgBin();
 if(!bin){const e=Error('PostgreSQL binaries (initdb/pg_ctl) not found; set PHIXAR_PG_BIN');e.code='PG_UNAVAILABLE';throw e}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phixar-pg-'));
 if(asPostgresUser())execFileSync('chown',['-R','postgres:postgres',dir]);
 const data=path.join(dir,'data');
 run(bin,['initdb','-D',data,'-U','rf_admin','--auth=trust','--encoding=UTF8','--locale=C.UTF-8','--no-sync']);
 const port=await freePort();
 run(bin,['pg_ctl','-D',data,'-w','-l',path.join(dir,'server.log'),'-o',`-p ${port} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off -c timezone=UTC`,'start']);
 const stop=()=>{try{run(bin,['pg_ctl','-D',data,'-w','-m','immediate','stop'])}catch{}try{fs.rmSync(dir,{recursive:true,force:true})}catch{}};
 return {bin,dir,port,stop,url:(user,db)=>`postgres://${user}@127.0.0.1:${port}/${db}`};
}

async function exec(url,sql){const c=new Client({connectionString:url});await c.connect();try{await c.query(sql)}finally{await c.end()}}

// Synthetic fixtures. All identifiers are random-looking test UUIDs; no real data.
const FIX=Object.freeze({
 orgA:'a0000000-0000-4000-8000-00000000000a',branchA:'a0000000-0000-4000-8000-0000000000b1',branchA2:'a0000000-0000-4000-8000-0000000000b2',
 orgB:'b0000000-0000-4000-8000-00000000000a',branchB:'b0000000-0000-4000-8000-0000000000b1',
 users:{
  ownerA:{id:'a1000000-0000-4000-8000-000000000001',email:'owner.a@e2e.invalid',role:'owner',org:'A'},
  managerA:{id:'a1000000-0000-4000-8000-000000000002',email:'manager.a@e2e.invalid',role:'manager',org:'A'},
  salesA:{id:'a1000000-0000-4000-8000-000000000003',email:'sales.a@e2e.invalid',role:'sales',org:'A'},
  ownerB:{id:'b1000000-0000-4000-8000-000000000001',email:'owner.b@e2e.invalid',role:'owner',org:'B'},
  invitee:{id:'c1000000-0000-4000-8000-000000000001',email:'invitee@e2e.invalid',role:null,org:null},
  unverified:{id:'c1000000-0000-4000-8000-000000000002',email:'unverified@e2e.invalid',role:null,org:null,emailVerified:false}
 }
});

async function bootstrap(cluster){
 const admin=cluster.url('rf_admin','postgres');
 await exec(admin,`CREATE ROLE rf_owner LOGIN NOSUPERUSER BYPASSRLS CREATEROLE;
  CREATE ROLE rf_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  CREATE ROLE rf_runtime_login LOGIN NOSUPERUSER NOBYPASSRLS IN ROLE rf_runtime;`);
 await exec(admin,'CREATE DATABASE rf_e2e OWNER rf_owner');
 const superDb=cluster.url('rf_admin','rf_e2e');
 await exec(superDb,`CREATE EXTENSION IF NOT EXISTS pgcrypto; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT ALL ON SCHEMA public TO rf_owner;`);
 const owner=cluster.url('rf_owner','rf_e2e');
 // Synthetic stand-in for the managed Better Auth tables that migrations read.
 await exec(owner,`CREATE SCHEMA neon_auth;
  CREATE TABLE neon_auth."user"(id uuid PRIMARY KEY,email text NOT NULL UNIQUE,name text,"emailVerified" boolean NOT NULL DEFAULT false,banned boolean NOT NULL DEFAULT false,"createdAt" timestamptz NOT NULL DEFAULT now());
  CREATE TABLE neon_auth.session(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),token text NOT NULL UNIQUE,"userId" uuid NOT NULL REFERENCES neon_auth."user"(id),"expiresAt" timestamptz NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now());
  REVOKE ALL ON SCHEMA neon_auth FROM PUBLIC;`);
 const applied=[];
 for(const file of [...SCHEMA_FILES,...migrationFiles()]){
  try{await exec(owner,fs.readFileSync(path.join(ROOT,file),'utf8'));applied.push(file)}
  catch(e){const err=Error(`Migration ${file} failed: ${e.message}`);err.code='MIGRATION_FAILED';err.file=file;throw err}
 }
 await seed(owner);
 return {applied,ownerUrl:owner,runtimeUrl:cluster.url('rf_runtime_login','rf_e2e'),adminUrl:superDb};
}

async function seed(ownerUrl){
 const u=FIX.users;
 const staff=Object.entries(u).filter(([,x])=>x.role).map(([k,x])=>{
  const org=x.org==='A'?FIX.orgA:FIX.orgB,branch=x.org==='A'?FIX.branchA:FIX.branchB;
  return `('${x.id.replace(/^(.)1/,'$1'+'2')}','${org}','${branch}','${x.id}','E2E ${k}','${x.role}',true)`;
 }).join(',');
 const users=Object.values(u).map(x=>`('${x.id}','${x.email}','E2E synthetic','${x.emailVerified===false?'false':'true'}')`).join(',');
 await exec(ownerUrl,`INSERT INTO rf_organizations(id,name) VALUES('${FIX.orgA}','E2E Tenant A'),('${FIX.orgB}','E2E Tenant B');
  INSERT INTO rf_branches(id,organization_id,name) VALUES('${FIX.branchA}','${FIX.orgA}','A hoofdvestiging'),('${FIX.branchA2}','${FIX.orgA}','A tweede vestiging'),('${FIX.branchB}','${FIX.orgB}','B hoofdvestiging');
  INSERT INTO neon_auth."user"(id,email,name,"emailVerified") VALUES ${users};
  INSERT INTO rf_staff(id,organization_id,branch_id,identity_subject,display_name,role,active) VALUES ${staff};
  INSERT INTO rf_customers(organization_id,display_name,email) VALUES('${FIX.orgA}','E2E klant van A','klant.a@e2e.invalid'),('${FIX.orgB}','E2E klant van B','klant.b@e2e.invalid');
  INSERT INTO rf_organization_memberships(organization_id,identity_subject,base_role,active,activated_at)
   SELECT organization_id,identity_subject,role,true,now() FROM rf_staff;
  INSERT INTO rf_branch_memberships(organization_id,branch_id,membership_id,active)
   SELECT m.organization_id,s.branch_id,m.id,true FROM rf_organization_memberships m JOIN rf_staff s ON s.organization_id=m.organization_id AND s.identity_subject=m.identity_subject;`);
}
function staffId(user){return user.id.replace(/^(.)1/,'$1'+'2')}

// pg Pool adapter for handler injection: mirrors @neondatabase/serverless Pool API
// (connect → client.query/release, end). Always connects as rf_runtime_login.
function runtimePoolFactory(runtimeUrl){
 return ()=>new Pool({connectionString:runtimeUrl,max:1,connectionTimeoutMillis:3000});
}

async function startIsolatedDatabase(){
 const cluster=await startCluster();
 try{const db=await bootstrap(cluster);return {...cluster,...db,fixtures:FIX,staffId,createPool:runtimePoolFactory(db.runtimeUrl)}}
 catch(e){cluster.stop();throw e}
}
module.exports={startIsolatedDatabase,pgBin,FIX,staffId};
