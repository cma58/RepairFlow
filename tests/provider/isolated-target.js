'use strict';
// Fail closed before any sign-in, session revocation or request if CI points at a
// different project/branch/preview/identity. Values come from lib/isolated-test-target.js.
const crypto=require('node:crypto');
const T=require('../../lib/isolated-test-target');
const {AUTH,ORIGIN,DATABASE_HOSTS}=T;
function blocked(){const e=Error('BLOCKED: provider E2E target is not the reviewed isolated Neon branch');e.code='BLOCKED';throw e}
function isPinnedEmail(email,emailSha256=T.EMAIL_SHA256){
 if(typeof email!=='string'||!email.trim())return false;
 const a=crypto.createHash('sha256').update(email.trim().toLowerCase(),'utf8').digest(),b=Buffer.from(emailSha256,'hex');
 return crypto.timingSafeEqual(a,b);
}
// emailSha256 is overridable for unit tests only, so negative cases can run without
// the owner's address; CI and the provider suite always use the pinned value.
function assertIsolatedTarget(env,{emailSha256=T.EMAIL_SHA256}={}){
 let auth,origin,db;
 try{auth=new URL(env.PHIXAR_E2E_NEON_AUTH_URL);origin=new URL(env.PHIXAR_E2E_TRUSTED_ORIGIN);
  if(env.PHIXAR_E2E_RUNTIME_DATABASE_URL!==undefined)db=new URL(env.PHIXAR_E2E_RUNTIME_DATABASE_URL);
 }catch{blocked()}
 if(auth.href.replace(/\/$/,'')!==AUTH||origin.href.replace(/\/$/,'')!==ORIGIN)blocked();
 if(!isPinnedEmail(env.PHIXAR_E2E_USER_EMAIL,emailSha256))blocked();
 // A database URL is no longer needed (the live preview holds it server-side). If one
 // is ever supplied it must still be the isolated branch with the restricted role.
 if(db&&(!['postgres:','postgresql:'].includes(db.protocol)||!DATABASE_HOSTS.includes(db.hostname)||db.pathname!=='/'+T.DATABASE_NAME||decodeURIComponent(db.username)!=='rf_runtime_login'))blocked();
 if(env.PHIXAR_E2E_ORGANIZATION_ID!==T.ORGANIZATION_ID||env.PHIXAR_E2E_BRANCH_ID!==T.BRANCH_ID||env.PHIXAR_E2E_EXPECTED_ROLE!==T.EXPECTED_ROLE)blocked();
}
// CI only needs the two personal values as secrets; everything else is pinned here.
function pinnedProviderEnv(env){
 return {...env,PHIXAR_E2E_ENVIRONMENT:'isolated',PHIXAR_E2E_NEON_AUTH_URL:AUTH,PHIXAR_E2E_TRUSTED_ORIGIN:ORIGIN,
  PHIXAR_E2E_ORGANIZATION_ID:T.ORGANIZATION_ID,PHIXAR_E2E_BRANCH_ID:T.BRANCH_ID,PHIXAR_E2E_EXPECTED_ROLE:T.EXPECTED_ROLE};
}
module.exports={assertIsolatedTarget,pinnedProviderEnv,isPinnedEmail,AUTH,ORIGIN,DATABASE_HOSTS,USER_ID:T.USER_ID};
