'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const callback=fs.readFileSync(path.join(__dirname,'../api/auth/callback.js'),'utf8');
const session=fs.readFileSync(path.join(__dirname,'../api/auth/session.js'),'utf8');

test('magic-link callback exchanges verifier server-side, not in browser',()=>{
 assert.match(callback,/neon_auth_session_verifier/);
 assert.match(callback,/AUTH\+'\/get-session'/);
 assert.match(callback,/HttpOnly; Secure; SameSite=Lax/);
 assert.match(callback,/redirect: 'manual'|redirect:'manual'/);
 assert.doesNotMatch(callback,/localStorage/);
});
test('callback rejects unexpected verifier and fails closed on missing session',()=>{
 assert.match(callback,/invalid_verifier/);
 assert.match(callback,/no_session/);
 assert.match(callback,/cookie_unavailable/);
});
test('session endpoint does not authorize staff or expose customer records',()=>{
 assert.match(session,/authorized:false/);
 assert.match(session,/no_session_cookie/);
 assert.doesNotMatch(session,/SELECT .*rf_customers|SELECT .*rf_repairs/i);
});
