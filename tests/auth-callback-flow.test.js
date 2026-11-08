import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/auth/callback.js';

test('callback binds the one-time verifier to the same branch cookie subject',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.REPAIRFLOW_NEON_AUTH_URL;
 process.env.REPAIRFLOW_NEON_AUTH_URL='https://ep-test.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth';
 const seen=[];
 globalThis.fetch=async(url)=>{
  seen.push(String(url));
  if(seen.length===1)return {ok:true,json:async()=>({session:{},user:{id:'one'}}),headers:{getSetCookie:()=>['better-auth.session_token=abc; Domain=neon.tech; Secure']}};
  return {ok:true,json:async()=>({session:{expiresAt:new Date(Date.now()+60000).toISOString()},user:{id:'other'}})};
 };
 let redirected,headers={};
 const res={setHeader(k,v){headers[k]=v;return this},redirect(status,to){redirected={status,to};return this},status(){return this},end(){return this}};
 try{
  await handler({method:'GET',query:{neon_auth_session_verifier:'ml-1234567890123'}},res);
  assert.deepEqual(redirected,{status:303,to:'/login.html?error=session_mismatch'});
  assert.equal(headers['Set-Cookie'],undefined);
  assert.equal(seen.length,2);
  assert.ok(seen.every(url=>url.startsWith(process.env.REPAIRFLOW_NEON_AUTH_URL+'/get-session')));
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.REPAIRFLOW_NEON_AUTH_URL;else process.env.REPAIRFLOW_NEON_AUTH_URL=oldUrl;}
});
