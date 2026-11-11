'use strict';
// The owner setup script may only ever write secrets for the reviewed isolated
// targets, with the restricted runtime role, never the owner role.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {buildSecrets}=require('../scripts/provider-e2e-setup');
const host='ep-broad-breeze-bajrzvnc-pooler.c-8.eu-central-1.aws.neon.tech';
const ok='postgresql://rf_runtime_login:synthetic-not-real@'+host+'/neondb?sslmode=require';
test('setup builds the nine pinned secrets for the isolated branch only',()=>{
 const s=buildSecrets({password:'p'.repeat(32),runtimeDatabaseUrl:ok});
 assert.deepEqual(Object.keys(s).sort(),['PHIXAR_E2E_BRANCH_ID','PHIXAR_E2E_ENVIRONMENT','PHIXAR_E2E_EXPECTED_ROLE','PHIXAR_E2E_NEON_AUTH_URL','PHIXAR_E2E_ORGANIZATION_ID',
  'PHIXAR_E2E_RUNTIME_DATABASE_URL','PHIXAR_E2E_TRUSTED_ORIGIN','PHIXAR_E2E_USER_EMAIL','PHIXAR_E2E_USER_PASSWORD']);
 assert.equal(s.PHIXAR_E2E_ENVIRONMENT,'isolated');assert.equal(s.PHIXAR_E2E_EXPECTED_ROLE,'none');
});
test('setup refuses owner role, other hosts, other databases and short passwords',()=>{
 for(const url of [ok.replace('rf_runtime_login','neondb_owner'),ok.replace(host,'ep-production.c-8.eu-central-1.aws.neon.tech'),
  ok.replace('/neondb','/otherdb'),'postgresql://rf_runtime_login@'+host+'/neondb','not a url',''])
  assert.throws(()=>buildSecrets({password:'p'.repeat(32),runtimeDatabaseUrl:url}));
 assert.throws(()=>buildSecrets({password:'short',runtimeDatabaseUrl:ok}));
});
