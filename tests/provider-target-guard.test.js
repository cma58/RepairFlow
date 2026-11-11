'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {assertIsolatedTarget,pinnedProviderEnv}=require('./provider/isolated-target');
// The owner's address is not stored in readable form (public repository); the
// pinned SHA-256 is checked here with a value from the test environment when present.
const OWNER=process.env.PHIXAR_E2E_USER_EMAIL;
const STAND_IN='pinned-identity@example.invalid',STAND_IN_HASH={emailSha256:require('node:crypto').createHash('sha256').update(STAND_IN).digest('hex')};
const good={PHIXAR_E2E_NEON_AUTH_URL:'https://ep-broad-breeze-bajrzvnc.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth',
 PHIXAR_E2E_TRUSTED_ORIGIN:'https://repair-flow-git-test-p0-weba-6c78f5-aminechtaiti-3069s-projects.vercel.app',
 PHIXAR_E2E_ORGANIZATION_ID:'11111111-1111-4111-8111-111111111111',
 PHIXAR_E2E_BRANCH_ID:'22222222-2222-4222-8222-222222222222',
 PHIXAR_E2E_EXPECTED_ROLE:'manager'};
test('provider E2E accepts only reviewed isolated Auth, preview, identity, tenant and role',(t)=>{
 const pinned={...good,PHIXAR_E2E_USER_EMAIL:STAND_IN};
 assert.doesNotThrow(()=>assertIsolatedTarget(pinned,STAND_IN_HASH));
 assert.doesNotThrow(()=>assertIsolatedTarget({...pinned,PHIXAR_E2E_RUNTIME_DATABASE_URL:'postgresql://rf_runtime_login:x@ep-broad-breeze-bajrzvnc-pooler.c-8.eu-central-1.aws.neon.tech/neondb'},STAND_IN_HASH));
 assert.throws(()=>assertIsolatedTarget(pinned),{code:'BLOCKED'},'stand-in is not the real pinned identity');
 if(OWNER){
  const ok={...good,PHIXAR_E2E_USER_EMAIL:OWNER};
  assert.doesNotThrow(()=>assertIsolatedTarget(ok));
  assert.doesNotThrow(()=>assertIsolatedTarget({...ok,PHIXAR_E2E_USER_EMAIL:' '+OWNER.toUpperCase()+' '}));
  assert.doesNotThrow(()=>assertIsolatedTarget(pinnedProviderEnv({PHIXAR_E2E_USER_EMAIL:OWNER})));
  assert.doesNotThrow(()=>assertIsolatedTarget({...ok,PHIXAR_E2E_RUNTIME_DATABASE_URL:'postgresql://rf_runtime_login:x@ep-broad-breeze-bajrzvnc-pooler.c-8.eu-central-1.aws.neon.tech/neondb'}));
 }else t.diagnostic('positive identity case needs PHIXAR_E2E_USER_EMAIL (CI environment secret); negative cases still run');
 for(const bad of [
  {PHIXAR_E2E_NEON_AUTH_URL:'https://ep-production.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth'},
  {PHIXAR_E2E_RUNTIME_DATABASE_URL:'postgresql://rf_runtime_login:x@ep-production.c-8.eu-central-1.aws.neon.tech/neondb'},
  {PHIXAR_E2E_RUNTIME_DATABASE_URL:'postgresql://neondb_owner:x@ep-broad-breeze-bajrzvnc.c-8.eu-central-1.aws.neon.tech/neondb'},
  {PHIXAR_E2E_RUNTIME_DATABASE_URL:''},
  {PHIXAR_E2E_TRUSTED_ORIGIN:'https://repair-flow-theta.vercel.app'},
  {PHIXAR_E2E_TRUSTED_ORIGIN:'https://unreviewed-preview.vercel.app'},
  {PHIXAR_E2E_ORGANIZATION_ID:'b7c7eeac-d1cc-42a3-bd09-d25a2280f474'},
  {PHIXAR_E2E_EXPECTED_ROLE:'owner'},
  {PHIXAR_E2E_EXPECTED_ROLE:'none'},
  {PHIXAR_E2E_USER_EMAIL:'someone.else@gmail.com'},
  {PHIXAR_E2E_USER_EMAIL:''},
  {PHIXAR_E2E_USER_EMAIL:'existing-staff@example.com'}
 ])assert.throws(()=>assertIsolatedTarget({...pinned,...bad},STAND_IN_HASH),{code:'BLOCKED'},JSON.stringify(bad));
 assert.throws(()=>assertIsolatedTarget(good),{code:'BLOCKED'},'missing identity');
});
test('pinned identity is a user ID plus SHA-256, no readable address in the public repository',()=>{
 const T=require('../lib/isolated-test-target');
 assert.match(T.EMAIL_SHA256,/^[0-9a-f]{64}$/);assert.match(T.USER_ID,/^[0-9a-f-]{36}$/);
 assert.equal(T.EXPECTED_ROLE,'manager');
 assert.doesNotMatch(JSON.stringify(T),/@/,'no readable e-mail address in the public repository');
});
