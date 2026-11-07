'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {generateAccessToken,hashToken,publicStatus,resolvePublicStatus}=require('../lib/customer-status');
const {createRepository,SQL}=require('../lib/customer-status-repository');
test('token is unpredictable format and hashed, never stored raw',()=>{
 const a=generateAccessToken(),b=generateAccessToken();
 assert.match(a,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(a,b);
 assert.equal(hashToken(a).length,32);assert.notEqual(hashToken(a).toString('hex'),a);
});
test('ticket number cannot authenticate',async()=>{
 let called=false;
 assert.equal(await resolvePublicStatus('PHX-2026-001',{findActiveAccessByDigest:async()=>{called=true}}),null);
 assert.equal(called,false);
});
test('public projection excludes location, IMEI, names and private notes',()=>{
 const output=publicStatus({reference:'PHX-001',status:'In reparatie',updated_at:'2026-11-07T12:00:00Z',current_location:'bij Amine',assigned_repairer:'Amine',device_serial:'123456789',internal_notes:'private',customer_email:'a@b.test'});
 assert.deepEqual(Object.keys(output),['reference','status','updatedAt','nextStep']);
 assert.equal(JSON.stringify(output).includes('Amine'),false);
});
test('token digest passed to repository and public fields only',async()=>{
 const token=generateAccessToken();let digest;
 const output=await resolvePublicStatus(token,{findActiveAccessByDigest:async d=>{digest=d;return {reference:'A',status:'Klaar',updated_at:'2026-11-07T12:00:00Z',internal_notes:'secret'}}});
 assert.deepEqual(digest,hashToken(token));assert.equal(output.status,'Klaar voor afhaling');
 assert.equal(JSON.stringify(output).includes('secret'),false);
});
test('repository uses parameterized digest and expiry/revocation checks',async()=>{
 let args;
 const repo=createRepository(async(sql,values)=>{args={sql,values};return {rows:[]}});
 await repo.findActiveAccessByDigest(Buffer.alloc(32));
 assert.equal(args.sql,SQL);assert.match(SQL,/revoked_at IS NULL/);assert.match(SQL,/expires_at > now\(\)/);
 assert.deepEqual(args.values,[Buffer.alloc(32)]);
});
