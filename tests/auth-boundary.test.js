import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../api/auth/me.js';

function invoke({method='GET',headers={}}={}){
 let statusCode=200,body=null,headersOut={};
 const req={method,headers};
 const res={
  setHeader(k,v){headersOut[k.toLowerCase()]=v;return this},
  status(code){statusCode=code;return this},
  json(data){body=data;return this}
 };
 return Promise.resolve(handler(req,res)).then(()=>({statusCode,body,headersOut}));
}

test('Rejects methods other than GET',async()=>{
 const r=await invoke({method:'POST'});
 assert.equal(r.statusCode,405);
 assert.equal(r.headersOut.allow,'GET');
});
test('Never returns personal data without staff auth configuration',async()=>{
 const previous=process.env.NEON_AUTH_ISSUER;
 delete process.env.NEON_AUTH_ISSUER;
 try{
  const r=await invoke();
  assert.equal(r.statusCode,503);
  assert.equal(r.body.error,'Medewerkersportaal nog niet geactiveerd');
  assert.match(r.headersOut['cache-control'],/no-store/);
 }finally{
  if(previous!==undefined)process.env.NEON_AUTH_ISSUER=previous;
 }
});
test('Rejects requests with no bearer token before database access',async()=>{
 const keys=['NEON_AUTH_ISSUER','NEON_AUTH_AUDIENCE','NEON_AUTH_JWKS_URL','REPAIRFLOW_NEON_AUTH_URL'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.NEON_AUTH_ISSUER='https://auth.example.test/neondb/auth';
 process.env.NEON_AUTH_AUDIENCE='repairflow';
 process.env.NEON_AUTH_JWKS_URL='https://auth.example.test/neondb/auth/.well-known/jwks.json';
 process.env.REPAIRFLOW_NEON_AUTH_URL='https://ep-example.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth';
 process.env.NEON_AUTH_ISSUER=process.env.REPAIRFLOW_NEON_AUTH_URL;
 process.env.NEON_AUTH_JWKS_URL=process.env.REPAIRFLOW_NEON_AUTH_URL+'/.well-known/jwks.json';
 try{
  const r=await invoke();
  assert.equal(r.statusCode,401);
  assert.equal(r.body.error,'Aanmelden vereist');
 }finally{
  for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
 }
});
test('Rejects a foreign browser origin',async()=>{
 const previous=process.env.REPAIRFLOW_APP_ORIGIN;
 process.env.REPAIRFLOW_APP_ORIGIN='https://preview.example.test';
 try{
  const r=await invoke({headers:{origin:'https://untrusted.example'}});
  assert.equal(r.statusCode,403);
  assert.equal(r.body.error,'origin_denied');
 }finally{if(previous===undefined)delete process.env.REPAIRFLOW_APP_ORIGIN;else process.env.REPAIRFLOW_APP_ORIGIN=previous;}
});
test('The public staff route cannot use the database owner connection',()=>{
 const source=fs.readFileSync(new URL('../api/auth/me.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/process\.env\.DATABASE_URL|\bneon\(process\.env\.DATABASE_URL\)/);
 assert.match(source,/staffSession\(req,res\)/);
});
