'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseBearer,getConfig,verifyStaffIdentity}=require('../lib/neon-auth-identity');
const env={NEON_AUTH_ISSUER:'https://auth.example.test/neondb/auth',NEON_AUTH_AUDIENCE:'repairflow',NEON_AUTH_JWKS_URL:'https://auth.example.test/neondb/auth/.well-known/jwks.json'};
test('only accepts strict bearer token',()=>{
 assert.equal(parseBearer('Bearer abc.def.sig'),'abc.def.sig');
 assert.throws(()=>parseBearer('Basic abc'),/UNAUTHORIZED/);
 assert.throws(()=>parseBearer('Bearer abc def'),/UNAUTHORIZED/);
});
test('requires configured HTTPS trusted issuer and matching JWKS origin',()=>{
 assert.equal(getConfig(env).audience,'repairflow');
 assert.throws(()=>getConfig({...env,NEON_AUTH_JWKS_URL:'https://evil.test/.well-known/jwks.json'}),/AUTH_NOT_CONFIGURED/);
 assert.throws(()=>getConfig({...env,NEON_AUTH_ISSUER:'http://auth.example.test/neondb/auth'}),/AUTH_NOT_CONFIGURED/);
});
test('passes strict verification options and only returns subject',async()=>{
 let captured;
 const identity=await verifyStaffIdentity('Bearer abc.def.sig',{env,jwksFactory:()=>({}),verify:async(token,key,opts)=>{captured=opts;return {payload:{sub:'user-1',email:'private@example.test'}};}});
 assert.deepEqual(identity,{subject:'user-1'});
 assert.equal(captured.issuer,env.NEON_AUTH_ISSUER);
 assert.equal(captured.audience,'repairflow');
 assert.ok(captured.algorithms.includes('RS256'));
});
test('rejects invalid signature and absent subject',async()=>{
 await assert.rejects(verifyStaffIdentity('Bearer abc.def.sig',{env,verify:async()=>{throw Error('signature')} ,jwksFactory:()=>({})}),/UNAUTHORIZED/);
 await assert.rejects(verifyStaffIdentity('Bearer abc.def.sig',{env,verify:async()=>({payload:{}}),jwksFactory:()=>({})}),/UNAUTHORIZED/);
});
