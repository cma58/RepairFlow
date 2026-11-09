'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {prepareInactiveOwner}=require('../lib/platform-bootstrap');
const subject='6b437408-ac72-4edf-9cbb-f499bd7a69fa';
test('prepares first platform owner inactive with review audit',async()=>{const calls=[],db={query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.startsWith('INSERT INTO rf_platform_owners')?[{identity_subject:subject,active:false}]:[]}}};const result=await prepareInactiveOwner(db,{verifiedSubject:subject,reviewReference:'Verified in separate admin review'});assert.deepEqual(result,{identitySubject:subject,active:false});assert.equal(calls.length,3);assert.equal(calls[2].params[3],'{"active":false}')});
test('second preparation and unverifiable identity fail closed',async()=>{const db={query:async()=>({rows:[{identity_subject:subject,active:false}]})};await assert.rejects(()=>prepareInactiveOwner(db,{verifiedSubject:subject,reviewReference:'Verified in separate admin review'}),{code:'INVALID_BOOTSTRAP'});await assert.rejects(()=>prepareInactiveOwner(db,{verifiedSubject:'attacker',reviewReference:'Verified in separate admin review'}),{code:'INVALID_BOOTSTRAP'})});
