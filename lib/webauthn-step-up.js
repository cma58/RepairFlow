'use strict';
const crypto=require('node:crypto');
const {appOrigin}=require('./neon-auth-session');
const {requireCurrentSession}=require('./session-guard');

function deny(code='ACCESS_DENIED'){const e=Error(code);e.code=code;throw e}
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
async function begin(db,identity,organizationId,ceremony,env,web){
 const {origin,rpID}=relyingParty(env);
 await requireCurrentSession(db,identity,organizationId);
 const recent=await db.query("SELECT count(*)::int AS n FROM rf_webauthn_challenges WHERE identity_subject=$1 AND session_id=$2 AND created_at>now()-interval '15 minutes'",[identity.subject,identity.sessionId]);
 if(Number(recent.rows[0]?.n)>=5)deny('RATE_LIMITED');
 const credentials=(await db.query('SELECT credential_id,transports FROM rf_webauthn_credentials WHERE identity_subject=$1 AND revoked_at IS NULL',[identity.subject])).rows;
 if(ceremony==='registration'&&Date.now()-Date.parse(identity.createdAt)>5*60*1000)deny('RECENT_LOGIN_REQUIRED');
 if(ceremony==='authentication'&&!credentials.length)deny('NO_CREDENTIAL');
 const options=ceremony==='registration'?await web.generateRegistrationOptions({
  rpName:'RepairFlow',rpID,userName:identity.subject,userID:new TextEncoder().encode(identity.subject),
  attestationType:'none',authenticatorSelection:{authenticatorAttachment:'cross-platform',residentKey:'discouraged',userVerification:'required'},
  excludeCredentials:credentials.map(c=>({id:c.credential_id,transports:c.transports}))
 }):await web.generateAuthenticationOptions({rpID,userVerification:'required',allowCredentials:credentials.map(c=>({id:c.credential_id,transports:c.transports}))});
 const hash=crypto.createHash('sha256').update(options.challenge).digest('hex');
 const inserted=await db.query('INSERT INTO rf_webauthn_challenges(identity_subject,session_id,organization_id,challenge_hash,ceremony,origin,rp_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
 [identity.subject,identity.sessionId,organizationId,hash,ceremony,origin,rpID]);
 await audit(db,identity,organizationId,'webauthn.challenge',{ceremony});
 return {challengeId:inserted.rows[0].id,options};
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
   if(!result.verified||!result.registrationInfo?.credential)throw Error('VERIFICATION_FAILED');
   const {credential,credentialDeviceType,credentialBackedUp}=result.registrationInfo;
   if(credential.id!==input.response.id||!['singleDevice','multiDevice'].includes(credentialDeviceType))throw Error('VERIFICATION_FAILED');
   await db.query(`INSERT INTO rf_webauthn_credentials(credential_id,identity_subject,public_key,sign_count,device_type,backed_up,transports)
   VALUES($1,$2,$3,$4,$5,$6,$7)`,[credential.id,identity.subject,Buffer.from(credential.publicKey),credential.counter,credentialDeviceType,credentialBackedUp,JSON.stringify(credential.transports||[])]);
   await audit(db,identity,organizationId,'webauthn.registered',{deviceType:credentialDeviceType,backedUp:credentialBackedUp});
   return {verified:true,independentFactor:false};
  }
  const found=await db.query(`SELECT credential_id,public_key,sign_count,transports,device_type,backed_up FROM rf_webauthn_credentials
  WHERE identity_subject=$1 AND credential_id=$2 AND revoked_at IS NULL FOR UPDATE`,[identity.subject,input.response.id]);
  if(found.rows.length!==1)throw Error('VERIFICATION_FAILED');
  const credential=found.rows[0];
  const result=await web.verifyAuthenticationResponse({response:input.response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,
   credential:{id:credential.credential_id,publicKey:new Uint8Array(credential.public_key),counter:Number(credential.sign_count),transports:credential.transports}});
  if(!result.verified)throw Error('VERIFICATION_FAILED');
  await db.query('UPDATE rf_webauthn_credentials SET sign_count=$3,last_used_at=now() WHERE identity_subject=$1 AND credential_id=$2',
   [identity.subject,credential.credential_id,result.authenticationInfo.newCounter]);
  await db.query(`INSERT INTO rf_webauthn_grants(identity_subject,session_id,organization_id,credential_id,independent_factor)
   VALUES($1,$2,$3,$4,false) ON CONFLICT(identity_subject,session_id,organization_id)
   DO UPDATE SET credential_id=EXCLUDED.credential_id,verified_at=now(),expires_at=now()+interval '5 minutes',independent_factor=false`,
   [identity.subject,identity.sessionId,organizationId,credential.credential_id]);
  await audit(db,identity,organizationId,'webauthn.verified',{credentialDeviceType:credential.device_type,backedUp:credential.backed_up,independentFactor:false});
  return {verified:true,independentFactor:false};
 }catch(error){
  if(error.code==='23505')throw error;
  await audit(db,identity,organizationId,'webauthn.rejected',{ceremony,reason:'verification'});
  return {verified:false};
 }
}
// All management actions call this gate. The CHECK constraint in migration 009
// makes it impossible to turn a non-attested passkey into an independent factor.
async function requireManagementStepUp(db,identity,organizationId){
 await requireCurrentSession(db,identity,organizationId);
 const rows=await db.query(`SELECT 1 FROM rf_webauthn_grants WHERE identity_subject=$1 AND session_id=$2 AND organization_id=$3
 AND independent_factor=true AND expires_at>now() LIMIT 1`,[identity.subject,identity.sessionId,organizationId]);
 if(rows.rows.length!==1)deny();
}
module.exports={relyingParty,begin,finish,requireManagementStepUp,validResponse};
