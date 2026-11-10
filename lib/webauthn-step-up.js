'use strict';
// WebAuthn ceremonies bound to a verified Neon Auth session (subject+session+tenant).
// MFA policy "option A" (migration 013): verified passkeys and FIDO2 keys. Whether a
// grant is an INDEPENDENT factor is decided by the database
// (rf_record_webauthn_assertion + guard trigger), never by this code or the client.
const crypto=require('node:crypto');
const {appOrigin}=require('./neon-auth-session');
const {requireCurrentSession}=require('./session-guard');

const PURPOSES=Object.freeze(['credential.activate','credential.manage','credential.approve','session.revoke','invitation.manage','policy.manage']);
const MAX_PENDING_CREDENTIALS=3;
function deny(code='ACCESS_DENIED'){const e=Error(code);e.code=code;throw e}
function fingerprint(credentialId){const h=crypto.createHash('sha256').update(String(credentialId),'utf8').digest('hex').toUpperCase();return h.slice(0,4)+'-'+h.slice(4,8)}
function relyingParty(env){
 const origin=appOrigin(env),rpID=env.REPAIRFLOW_WEBAUTHN_RP_ID;
 if(typeof rpID!=='string'||!rpID||!/^([a-z0-9-]+\.)*[a-z0-9-]+$/.test(rpID)||
   !(new URL(origin).hostname===rpID||new URL(origin).hostname.endsWith('.'+rpID)))deny('WEBAUTHN_UNAVAILABLE');
 return {origin,rpID};
}
function validResponse(response){return response&&typeof response==='object'&&!Array.isArray(response)&&
 typeof response.id==='string'&&response.id.length>=16&&response.id.length<=1024&&
 JSON.stringify(response).length<=16000}
async function audit(db,identity,organizationId,action,detail={}){
 await db.query('INSERT INTO rf_security_events(identity_subject,session_id,organization_id,action,detail) VALUES($1,$2,$3,$4,$5)',
 [identity.subject,identity.sessionId,organizationId,action,JSON.stringify(detail)]);
}
// True when the subject already holds an approved, usable key in THIS tenant.
async function hasApprovedCredential(db,identity,organizationId){
 const r=await db.query(`SELECT 1 FROM rf_webauthn_approvals a JOIN rf_webauthn_credentials c ON c.credential_id=a.credential_id
 WHERE a.identity_subject=$1 AND a.organization_id=$2 AND a.revoked_at IS NULL AND c.revoked_at IS NULL AND c.blocked_at IS NULL LIMIT 1`,[identity.subject,organizationId]);
 return r.rows.length===1;
}
// Non-consuming precheck for a live, independent, purpose-bound step-up in this
// session. The SQL management functions consume the grant atomically.
async function hasStepUp(db,identity,organizationId,purpose){
 const r=await db.query(`SELECT 1 FROM rf_webauthn_grants g WHERE g.identity_subject=$1 AND g.session_id=$2 AND g.organization_id=$3
 AND g.independent_factor AND g.purpose=$4 AND g.consumed_at IS NULL AND g.expires_at>now() LIMIT 1`,[identity.subject,identity.sessionId,organizationId,purpose]);
 return r.rows.length===1;
}
// Adding a key when an approved key exists in this tenant requires an independent
// step-up (purpose credential.manage) with that key in THIS session (finding F2).
async function requireEnrollmentStepUp(db,identity,organizationId){
 if(!await hasStepUp(db,identity,organizationId,'credential.manage'))deny('STEP_UP_REQUIRED');
}
async function pendingCount(db,identity,organizationId){
 const r=await db.query(`SELECT count(*)::int AS n FROM rf_webauthn_credentials c WHERE c.identity_subject=$1 AND c.revoked_at IS NULL AND c.blocked_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM rf_webauthn_approvals a WHERE a.credential_id=c.credential_id AND a.organization_id=$2 AND a.revoked_at IS NULL)`,[identity.subject,organizationId]);
 return Number(r.rows[0]?.n||0);
}
// Serialize enrollment per subject so parallel registrations observe a consistent state.
async function lockEnrollment(db,identity){await db.query("SELECT pg_advisory_xact_lock(hashtextextended('rf_webauthn_enrollment:'||$1,0))",[identity.subject])}
async function begin(db,identity,organizationId,ceremony,env,web,{purpose='credential.activate'}={}){
 const {origin,rpID}=relyingParty(env);
 await requireCurrentSession(db,identity,organizationId);
 if(ceremony==='authentication'&&!PURPOSES.includes(purpose))deny('INVALID_INPUT');
 const recent=await db.query("SELECT count(*)::int AS n FROM rf_webauthn_challenges WHERE identity_subject=$1 AND session_id=$2 AND created_at>now()-interval '15 minutes'",[identity.subject,identity.sessionId]);
 if(Number(recent.rows[0]?.n)>=5)deny('RATE_LIMITED');
 const usable=(await db.query('SELECT credential_id,transports FROM rf_webauthn_credentials WHERE identity_subject=$1 AND revoked_at IS NULL AND blocked_at IS NULL',[identity.subject])).rows;
 if(ceremony==='registration'){
  if(!Number.isFinite(Date.parse(identity.createdAt))||Date.now()-Date.parse(identity.createdAt)>5*60*1000||Date.parse(identity.createdAt)>Date.now()+60000)deny('RECENT_LOGIN_REQUIRED');
  if(await hasApprovedCredential(db,identity,organizationId))await requireEnrollmentStepUp(db,identity,organizationId);
  else if(await pendingCount(db,identity,organizationId)>=MAX_PENDING_CREDENTIALS)deny('TOO_MANY_PENDING');
 }
 if(ceremony==='authentication'&&!usable.length)deny('NO_CREDENTIAL');
 const known=ceremony==='registration'?(await db.query('SELECT credential_id,transports FROM rf_webauthn_credentials WHERE identity_subject=$1 AND revoked_at IS NULL',[identity.subject])).rows:usable;
 const options=ceremony==='registration'?await web.generateRegistrationOptions({
  rpName:'RepairFlow',rpID,userName:identity.subject,userID:new TextEncoder().encode(identity.subject),
  // Option A: platform passkeys and roaming FIDO2 keys; UV always required.
  attestationType:'none',authenticatorSelection:{residentKey:'preferred',userVerification:'required'},
  excludeCredentials:known.map(c=>({id:c.credential_id,transports:c.transports}))
 }):await web.generateAuthenticationOptions({rpID,userVerification:'required',allowCredentials:usable.map(c=>({id:c.credential_id,transports:c.transports}))});
 const hash=crypto.createHash('sha256').update(options.challenge).digest('hex');
 const inserted=await db.query('INSERT INTO rf_webauthn_challenges(identity_subject,session_id,organization_id,challenge_hash,ceremony,origin,rp_id,purpose) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
 [identity.subject,identity.sessionId,organizationId,hash,ceremony,origin,rpID,ceremony==='authentication'?purpose:'credential.activate']);
 await audit(db,identity,organizationId,'webauthn.challenge',{ceremony,purpose:ceremony==='authentication'?purpose:'enrollment'});
 return {challengeId:inserted.rows[0].id,options,...(ceremony==='authentication'?{purpose}:{})};
}
async function finish(db,identity,organizationId,ceremony,input,env,web){
 const {origin,rpID}=relyingParty(env);
 await requireCurrentSession(db,identity,organizationId);
 if(!/^[0-9a-f-]{36}$/i.test(input?.challengeId||'')||!validResponse(input?.response))deny('INVALID_INPUT');
 // Consume before any cryptographic check. Caller MUST commit even when verification fails.
 const c=await db.query(`UPDATE rf_webauthn_challenges SET consumed_at=now()
 WHERE id=$1 AND identity_subject=$2 AND session_id=$3 AND organization_id=$4 AND ceremony=$5
 AND origin=$6 AND rp_id=$7 AND consumed_at IS NULL AND expires_at>now()
 RETURNING challenge_hash`,[input.challengeId,identity.subject,identity.sessionId,organizationId,ceremony,origin,rpID]);
 if(c.rows.length!==1)deny('INVALID_CHALLENGE');
 let challenge;
 try{challenge=JSON.parse(Buffer.from(input.response.response?.clientDataJSON||'','base64url').toString('utf8')).challenge}catch{}
 if(typeof challenge!=='string'||crypto.createHash('sha256').update(challenge).digest('hex')!==c.rows[0].challenge_hash){
  await audit(db,identity,organizationId,'webauthn.rejected',{ceremony,reason:'challenge'});
  return {verified:false};
 }
 try{
  if(ceremony==='registration'){
   const result=await web.verifyRegistrationResponse({response:input.response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});
   if(!result.verified||!result.registrationInfo?.credential||result.registrationInfo.userVerified!==true)throw Error('VERIFICATION_FAILED');
   const {credential,credentialDeviceType,credentialBackedUp,aaguid,fmt}=result.registrationInfo;
   if(credential.id!==input.response.id||!['singleDevice','multiDevice'].includes(credentialDeviceType))throw Error('VERIFICATION_FAILED');
   await lockEnrollment(db,identity);
   const approvedExists=await hasApprovedCredential(db,identity,organizationId);
   if(approvedExists&&!await hasStepUp(db,identity,organizationId,'credential.manage'))throw Error('VERIFICATION_FAILED');
   if(!approvedExists&&await pendingCount(db,identity,organizationId)>=MAX_PENDING_CREDENTIALS)throw Error('VERIFICATION_FAILED');
   // A duplicate credential ID (23505) must not roll back the consumed challenge.
   await db.query('SAVEPOINT rf_webauthn_credential_insert');
   try{
    await db.query(`INSERT INTO rf_webauthn_credentials(credential_id,identity_subject,public_key,sign_count,device_type,backed_up,transports,aaguid,attestation_format,user_verified)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,[credential.id,identity.subject,Buffer.from(credential.publicKey),credential.counter,credentialDeviceType,credentialBackedUp,
     JSON.stringify(credential.transports||[]),/^[0-9a-f-]{36}$/i.test(aaguid||'')?aaguid:null,typeof fmt==='string'?fmt.slice(0,32):null]);
   }catch(e){
    await db.query('ROLLBACK TO SAVEPOINT rf_webauthn_credential_insert');
    if(e.code==='23505')throw Error('VERIFICATION_FAILED');
    throw e;
   }
   await db.query('RELEASE SAVEPOINT rf_webauthn_credential_insert');
   await audit(db,identity,organizationId,'webauthn.registered',{deviceType:credentialDeviceType,backedUp:credentialBackedUp,fingerprint:fingerprint(credential.id),approvalRequired:!approvedExists});
   // With step-up by an approved key the new key is approved in the same transaction
   // (consumes the credential.manage grant). Otherwise it stays PENDING: it can never
   // yield an independent factor until bootstrap or another owner approves it.
   if(approvedExists)await db.query('SELECT public.rf_approve_own_credential_by_step_up($1)',[credential.id]);
   return {verified:true,independentFactor:false,state:approvedExists?'active':'pending',fingerprint:fingerprint(credential.id),synced:credentialDeviceType==='multiDevice'||credentialBackedUp};
  }
  const found=await db.query(`SELECT credential_id,public_key,sign_count,transports FROM rf_webauthn_credentials
  WHERE identity_subject=$1 AND credential_id=$2 AND revoked_at IS NULL AND blocked_at IS NULL FOR UPDATE`,[identity.subject,input.response.id]);
  if(found.rows.length!==1)throw Error('VERIFICATION_FAILED');
  const credential=found.rows[0];
  const result=await web.verifyAuthenticationResponse({response:input.response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,
   credential:{id:credential.credential_id,publicKey:new Uint8Array(credential.public_key),counter:Number(credential.sign_count),transports:credential.transports}});
  if(!result.verified||result.authenticationInfo?.userVerified!==true)throw Error('VERIFICATION_FAILED');
  await db.query('UPDATE rf_webauthn_credentials SET sign_count=$3,last_used_at=now(),backed_up_last=$4 WHERE identity_subject=$1 AND credential_id=$2',
   [identity.subject,credential.credential_id,result.authenticationInfo.newCounter,result.authenticationInfo.credentialBackedUp===true]);
  const recorded=await db.query('SELECT public.rf_record_webauthn_assertion($1,$2,$3,$4) AS grant',
   [input.challengeId,credential.credential_id,true,result.authenticationInfo.credentialBackedUp===true]);
  const grant=recorded.rows[0].grant;
  return {verified:true,independentFactor:grant.independentFactor===true,purpose:grant.purpose,fingerprint:fingerprint(credential.credential_id)};
 }catch(error){
  if(error.severity)throw error; // PostgreSQL errors abort the transaction (503); library errors are rejections
  await audit(db,identity,organizationId,'webauthn.rejected',{ceremony,reason:'verification'});
  return {verified:false};
 }
}
// Management gate (precheck). The SQL function performs the atomic, single-use
// consumption for the same purpose and re-checks every condition.
async function requireManagementStepUp(db,identity,organizationId,purpose){
 await requireCurrentSession(db,identity,organizationId);
 if(!PURPOSES.includes(purpose)||purpose==='credential.activate')deny();
 if(!await hasStepUp(db,identity,organizationId,purpose))deny('STEP_UP_REQUIRED');
}
module.exports={PURPOSES,MAX_PENDING_CREDENTIALS,fingerprint,relyingParty,begin,finish,requireManagementStepUp,requireEnrollmentStepUp,hasApprovedCredential,validResponse};
