'use strict';
// These are public identifiers of the ONE reviewed, non-default Neon branch.
// Fail closed before any sign-in, session revocation, or database write if CI
// points at a different project/branch. Change only after a new isolation review.
const AUTH='https://ep-broad-breeze-bajrzvnc.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth';
const ORIGIN='https://repair-flow-git-test-p0-weba-6c78f5-aminechtaiti-3069s-projects.vercel.app';
// Synthetic test identity (owner-approved alias, created via the Neon Auth API on the
// isolated branch only; no PHIXAR staff row or membership).
const EMAIL='amine.chtaiti+phixar-e2e@gmail.com';
const DATABASE_HOSTS=new Set([
 'ep-broad-breeze-bajrzvnc.c-8.eu-central-1.aws.neon.tech',
 'ep-broad-breeze-bajrzvnc-pooler.c-8.eu-central-1.aws.neon.tech'
]);
function blocked(){const e=Error('BLOCKED: provider E2E target is not the reviewed isolated Neon branch');e.code='BLOCKED';throw e}
function assertIsolatedTarget(env){
 let auth,origin,db;
 try{auth=new URL(env.PHIXAR_E2E_NEON_AUTH_URL);origin=new URL(env.PHIXAR_E2E_TRUSTED_ORIGIN);
  if(env.PHIXAR_E2E_RUNTIME_DATABASE_URL)db=new URL(env.PHIXAR_E2E_RUNTIME_DATABASE_URL);
 }catch{blocked()}
 if(auth.href.replace(/\/$/,'')!==AUTH||origin.href.replace(/\/$/,'')!==ORIGIN)blocked();
 if(env.PHIXAR_E2E_USER_EMAIL?.toLowerCase()!==EMAIL)blocked();
 if(!db||!['postgres:','postgresql:'].includes(db.protocol)||!DATABASE_HOSTS.has(db.hostname)||db.pathname!=='/neondb')blocked();
 if(env.PHIXAR_E2E_ORGANIZATION_ID!=='11111111-1111-4111-8111-111111111111'||
  env.PHIXAR_E2E_BRANCH_ID!=='22222222-2222-4222-8222-222222222222'||
  env.PHIXAR_E2E_EXPECTED_ROLE!=='none')blocked();
}
module.exports={assertIsolatedTarget,AUTH,ORIGIN,EMAIL,DATABASE_HOSTS};
