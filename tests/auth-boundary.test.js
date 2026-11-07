import test from 'node:test';
import assert from 'node:assert/strict';
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
test('Never returns personal data without database configuration',async()=>{
 const previous=process.env.DATABASE_URL;
 delete process.env.DATABASE_URL;
 try{
  const r=await invoke();
  assert.equal(r.statusCode,503);
  assert.equal(r.body.error,'auth_not_configured');
  assert.match(r.headersOut['cache-control'],/no-store/);
 }finally{
  if(previous!==undefined)process.env.DATABASE_URL=previous;
 }
});
test('Rejects requests with no bearer token before database access',async()=>{
 const previous=process.env.DATABASE_URL;
 process.env.DATABASE_URL='postgresql://invalid:invalid@localhost/unused';
 try{
  const r=await invoke();
  assert.equal(r.statusCode,401);
  assert.equal(r.body.error,'missing_access_token');
 }finally{
  if(previous===undefined)delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL=previous;
 }
});
test('Rejects a foreign browser origin',async()=>{
 const previous=process.env.DATABASE_URL;
 process.env.DATABASE_URL='postgresql://invalid:invalid@localhost/unused';
 try{
  const r=await invoke({headers:{origin:'https://untrusted.example'}});
  assert.equal(r.statusCode,403);
  assert.equal(r.body.error,'origin_denied');
 }finally{
  if(previous===undefined)delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL=previous;
 }
});
