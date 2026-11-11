'use strict';
// Security-key management, first enrollment activation and recovery (MFA phase 2).
// Every state change is executed by a SECURITY DEFINER function from migration 013
// that re-checks session, tenant, role and, where required, consumes a single-use,
// purpose-bound independent step-up. This module only validates input shape.
const crypto=require('node:crypto');
const {withSecurityTransaction}=require('./security-transaction');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT=/^[0-9A-F]{4}-[0-9A-F]{4}$/;
// Crockford base32 (no I, L, O, U): 26 symbols = 130 bits from 16 random bytes.
const ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ACTIONS=Object.freeze(['securityStatus','redeemBootstrap','revokeCredential','blockCredential','approveCredential','revokeMemberCredential','setSecurityPolicy']);
function invalid(){const e=Error('INVALID_INPUT');e.code='INVALID_INPUT';throw e}
function normalizeCode(code){
 if(typeof code!=='string'||code.length>64)return null;
 const n=code.toUpperCase().replace(/[\s-]/g,'');
 return n.length===26&&[...n].every(ch=>ALPHABET.includes(ch))?n:null;
}
function hashCode(normalized){return crypto.createHash('sha256').update(normalized,'utf8').digest('hex')}
function newCode(){
 const bytes=crypto.randomBytes(17);let bits=0,value=0,out='';
 for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5&&out.length<26){out+=ALPHABET[(value>>>(bits-5))&31];bits-=5}}
 return out;
}
function displayCode(normalized){return normalized.match(/.{1,5}/g).join('-')}
function fingerprintArg(v){if(typeof v!=='string'||!FINGERPRINT.test(v.toUpperCase()))invalid();return v.toUpperCase()}
function reasonArg(v,min=10){if(typeof v!=='string'||v.trim().length<min||v.length>500)invalid();return v.trim()}

async function credentialManagement(req,res,deps){
 const action=req.body?.action;
 if(!ACTIONS.includes(action)){res.setHeader('Cache-Control','no-store, private');return res.status(400).json({error:'invalid_action'})}
 const ownerOnly=['approveCredential','revokeMemberCredential','setSecurityPolicy'].includes(action);
 return withSecurityTransaction(req,res,deps,{roles:ownerOnly?['owner']:['owner','manager']},async({db,staff})=>{
  const b=req.body;
  if(action==='securityStatus'){
   const own=(await db.query('SELECT public.rf_own_security_status() AS s')).rows[0].s;
   const members=staff.role==='owner'?(await db.query('SELECT public.rf_member_security_overview() AS m')).rows[0].m:undefined;
   const active=own.credentials.filter(c=>c.state==='active').length;
   return {body:{role:staff.role,mfaReady:active>0,allowSyncedPasskeys:own.allowSyncedPasskeys,credentials:own.credentials,...(members?{members}:{})}};
  }
  if(action==='redeemBootstrap'){
   const code=normalizeCode(b.code);if(!code)invalid();
   const r=(await db.query('SELECT public.rf_redeem_mfa_bootstrap($1) AS r',[hashCode(code)])).rows[0].r;
   // A rejected code is committed (failed-attempt counter, audit) and reported as 403.
   return r.activated?{body:{activated:true,fingerprint:r.fingerprint}}:{status:403,body:{error:'bootstrap_rejected'}};
  }
  if(action==='revokeCredential'){
   await db.query('SELECT public.rf_revoke_own_credential($1,$2)',[fingerprintArg(b.fingerprint),reasonArg(b.reason,3)]);
   return {body:{revoked:true}};
  }
  if(action==='blockCredential'){
   await db.query('SELECT public.rf_block_own_credential($1,$2)',[fingerprintArg(b.fingerprint),reasonArg(b.reason)]);
   return {body:{blocked:true,sessionsEnded:true}};
  }
  if(action==='approveCredential'){
   if(!UUID.test(b.targetStaffId||''))invalid();
   const id=(await db.query('SELECT public.rf_approve_member_credential($1,$2) AS id',[b.targetStaffId,fingerprintArg(b.fingerprint)])).rows[0].id;
   return {body:{approved:true,approvalId:id}};
  }
  if(action==='revokeMemberCredential'){
   if(!UUID.test(b.targetStaffId||''))invalid();
   await db.query('SELECT public.rf_revoke_member_credential($1,$2,$3)',[b.targetStaffId,fingerprintArg(b.fingerprint),reasonArg(b.reason)]);
   return {body:{revoked:true}};
  }
  if(typeof b.allowSyncedPasskeys!=='boolean')invalid();
  const v=(await db.query('SELECT public.rf_set_security_policy($1) AS v',[b.allowSyncedPasskeys])).rows[0].v;
  return {body:{allowSyncedPasskeys:v}};
 });
}
module.exports={credentialManagement,ACTIONS,normalizeCode,hashCode,newCode,displayCode};
