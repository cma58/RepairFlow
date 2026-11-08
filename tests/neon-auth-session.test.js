'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {authUrl,appOrigin,sessionCookie,forwardedCookie,verifySession}=require('../lib/neon-auth-session');
const env={REPAIRFLOW_NEON_AUTH_URL:'https://ep-test.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth',REPAIRFLOW_APP_ORIGIN:'https://preview.example.test'};
test('auth endpoint and callback origin are explicit and branch specific',()=>{
 assert.equal(authUrl(env),env.REPAIRFLOW_NEON_AUTH_URL);
 assert.equal(appOrigin(env),env.REPAIRFLOW_APP_ORIGIN);
 for(const bad of ['http://ep-test.neon.tech/auth','https://evil.test/auth','https://user:pass@ep-test.neon.tech/auth'])assert.throws(()=>authUrl({...env,REPAIRFLOW_NEON_AUTH_URL:bad}));
 assert.throws(()=>appOrigin({...env,REPAIRFLOW_APP_ORIGIN:'https://preview.example.test/redirect'}));
});
test('only one valid session cookie is accepted and forwarded without provider domain',()=>{
 assert.equal(sessionCookie('other=abc; better-auth.session_token=abc.123'),'better-auth.session_token=abc.123');
 assert.equal(sessionCookie('better-auth.session_token=one; better-auth.session_token=two'),null);
 assert.equal(sessionCookie('better-auth.session_token=abc\r\nBad: injected'),null);
 assert.match(forwardedCookie('better-auth.session_token=abc; Domain=evil.test; SameSite=None'),/Path=\/; HttpOnly; Secure; SameSite=Lax/);
 assert.doesNotMatch(forwardedCookie('better-auth.session_token=abc; Domain=evil.test'),/evil\.test/);
});
test('cookie must be confirmed by branch Auth with a valid unexpired session',async()=>{
 const fetcher=async(url,opts)=>{assert.equal(url,env.REPAIRFLOW_NEON_AUTH_URL+'/get-session');assert.equal(opts.headers.Cookie,'better-auth.session_token=abc');return {ok:true,json:async()=>({user:{id:'subject-1'},session:{expiresAt:new Date(Date.now()+60000).toISOString()}})};};
 assert.deepEqual(await verifySession('better-auth.session_token=abc',{env,fetcher}),{subject:'subject-1'});
 for(const bad of [{user:{id:'subject-1'},session:{expiresAt:new Date(Date.now()-1000).toISOString()}},{user:{id:'subject-1'},session:{}},{user:{id:''},session:{expiresAt:new Date(Date.now()+60000).toISOString()}}]){
  await assert.rejects(verifySession('better-auth.session_token=abc',{env,fetcher:async()=>({ok:true,json:async()=>bad})}),/UNAUTHORIZED/);
 }
 await assert.rejects(verifySession('better-auth.session_token=abc',{env,fetcher:async()=>({ok:false})}),/UNAUTHORIZED/);
});
