'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {assertIsolatedTarget}=require('./provider/isolated-target');
const good={PHIXAR_E2E_NEON_AUTH_URL:'https://ep-broad-breeze-bajrzvnc.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth',
 PHIXAR_E2E_TRUSTED_ORIGIN:'https://repair-flow-git-test-p0-weba-6c78f5-aminechtaiti-3069s-projects.vercel.app',
 PHIXAR_E2E_USER_EMAIL:'phixar-e2e-provider@example.com',
 PHIXAR_E2E_RUNTIME_DATABASE_URL:'postgresql://synthetic:dummy@ep-broad-breeze-bajrzvnc.c-8.eu-central-1.aws.neon.tech/neondb'};
test('provider E2E accepts only reviewed isolated Auth and database hosts',()=>{
 assert.doesNotThrow(()=>assertIsolatedTarget(good));
 for(const bad of [
  {PHIXAR_E2E_NEON_AUTH_URL:'https://ep-production.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth'},
  {PHIXAR_E2E_RUNTIME_DATABASE_URL:'postgresql://synthetic:dummy@ep-production.c-8.eu-central-1.aws.neon.tech/neondb'},
  {PHIXAR_E2E_TRUSTED_ORIGIN:'https://repair-flow-theta.vercel.app'},
  {PHIXAR_E2E_USER_EMAIL:'existing-staff@example.com'}
 ])assert.throws(()=>assertIsolatedTarget({...good,...bad}),{code:'BLOCKED'});
});
