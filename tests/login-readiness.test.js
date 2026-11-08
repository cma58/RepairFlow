'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('login is fail-closed before any asynchronous readiness check',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../login.html'),'utf8');
 assert.match(html,/<form[^>]*id="login"[^>]*hidden/);
 assert.match(html,/Aanmelden tijdelijk gepauzeerd/);
 assert.doesNotMatch(html,/authBase\+'\/sign-in\/magic-link'/);
});
test('public auth status never claims sessions are ready',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../api/auth/status.js'),'utf8');
 assert.match(source,/REPAIRFLOW_AUTH_LOGIN_ENABLED==='true'/);
 assert.match(source,/REPAIRFLOW_AUTH_EXCHANGE_VERIFIED==='true'/);
 assert.match(source,/authorization:loginEnabled\?'staff_check_available':'disabled'/);
 assert.match(source,/canAccessCustomerData:false/);
});
