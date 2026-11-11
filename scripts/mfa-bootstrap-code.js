#!/usr/bin/env node
'use strict';
// Operator procedure (break-glass) for the FIRST security key of an organization
// admin, or for RECOVERY when every key is lost and no other owner can approve.
//
// Runs with the database OWNER role (never the runtime role, which has no access to
// rf_mfa_bootstrap_codes). Prints a one-time code ONCE; only its SHA-256 hash is
// stored. Valid 15 minutes (max 30), single use, 5 wrong attempts invalidate it.
// Hand the code over out of band (in person / by phone after verifying identity),
// never by e-mail. The person then, on /security, registers a key (state: pending),
// confirms with that key and enters the code: the key becomes active.
//
// Operator without a computer: the same checks and storage are available to the owner
// role as SQL (migration 015, rf_operator_issue_bootstrap_code); see
// docs/PHIXAR-P0-NEON-AUTH-VERIFICATION.md §16 for the phone procedure.
//
// Usage:
//   REPAIRFLOW_OWNER_DATABASE_URL=postgres://... node scripts/mfa-bootstrap-code.js \
//     --organization <uuid> --subject <neon-auth-user-uuid> --operator "Naam, in persoon" \
//     [--purpose bootstrap|recovery] [--minutes 15]
const crypto=require('node:crypto');
const {newCode,hashCode,displayCode}=require('../lib/credential-management');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function issueBootstrapCode(query,{organizationId,subject,operator,purpose='bootstrap',minutes=15}){
 if(!UUID.test(organizationId||'')||typeof subject!=='string'||!subject||subject.length>255)throw Error('organization and subject are required');
 if(!['bootstrap','recovery'].includes(purpose))throw Error('purpose must be bootstrap or recovery');
 if(typeof operator!=='string'||operator.trim().length<3||operator.length>120)throw Error('--operator must name who verified the identity');
 if(!Number.isInteger(minutes)||minutes<1||minutes>30)throw Error('--minutes must be between 1 and 30');
 const staff=(await query(`SELECT s.id,s.role FROM rf_staff s WHERE s.organization_id=$1 AND s.identity_subject=$2 AND s.active AND s.role IN ('owner','manager')`,[organizationId,subject])).rows;
 if(staff.length!==1)throw Error('subject is not an active owner/manager of this organization');
 const verified=(await query(`SELECT 1 FROM neon_auth."user" u WHERE u.id::text=$1 AND u."emailVerified" IS TRUE AND u.banned IS NOT TRUE`,[subject])).rows;
 if(verified.length!==1)throw Error('Neon Auth user is missing, unverified or banned');
 if(purpose==='bootstrap'){
  const active=(await query(`SELECT 1 FROM rf_webauthn_approvals a JOIN rf_webauthn_credentials c ON c.credential_id=a.credential_id
   WHERE a.identity_subject=$1 AND a.organization_id=$2 AND a.revoked_at IS NULL AND c.revoked_at IS NULL AND c.blocked_at IS NULL LIMIT 1`,[subject,organizationId])).rows;
  if(active.length)throw Error('subject already has an approved key; use step-up or purpose recovery after blocking lost keys');
 }
 await query(`UPDATE rf_mfa_bootstrap_codes SET invalidated_at=now() WHERE organization_id=$1 AND identity_subject=$2 AND used_at IS NULL AND invalidated_at IS NULL`,[organizationId,subject]);
 const code=newCode();
 const row=(await query(`INSERT INTO rf_mfa_bootstrap_codes(organization_id,identity_subject,purpose,code_hash,created_by,expires_at)
  VALUES($1,$2,$3,$4,$5,now()+make_interval(mins=>$6)) RETURNING id,expires_at`,[organizationId,subject,purpose,hashCode(code),operator.trim(),minutes])).rows[0];
 return {id:row.id,expiresAt:row.expires_at,code:displayCode(code),staffRole:staff[0].role};
}

function arg(name){const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:undefined}
async function main(){
 const url=process.env.REPAIRFLOW_OWNER_DATABASE_URL;
 if(!url)throw Error('REPAIRFLOW_OWNER_DATABASE_URL is required (owner role; never commit it)');
 const {Client}=require('pg');const client=new Client({connectionString:url});await client.connect();
 try{
  await client.query('BEGIN');
  const r=await issueBootstrapCode((s,p)=>client.query(s,p),{organizationId:arg('organization'),subject:arg('subject'),operator:arg('operator'),
   purpose:arg('purpose')||'bootstrap',minutes:Number(arg('minutes')||15)});
  await client.query('COMMIT');
  process.stdout.write(`\nEenmalige ${r.staffRole}-code (${arg('purpose')||'bootstrap'}), geldig tot ${new Date(r.expiresAt).toISOString()}:\n\n   ${r.code}\n\nGeef deze code alleen persoonlijk of telefonisch door. Code-ID ${r.id} (voor audit).\n`);
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{await client.end()}
}
if(require.main===module)main().catch(e=>{process.stderr.write('Geweigerd: '+e.message+'\n');process.exit(1)});
module.exports={issueBootstrapCode};
