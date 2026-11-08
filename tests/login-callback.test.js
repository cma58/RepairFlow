'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../login.html'),'utf8');
test('magic link return exchanges verifier before any login readiness request',()=>{
 assert.match(html,/params\.has\('neon_auth_session_verifier'\)/);
 assert.match(html,/location\.replace\('\/api\/auth\/callback\?neon_auth_session_verifier='/);
 assert.match(html,/if\(!returningFromAuth\)loadReadiness\(\)/);
});
test('callback status is not overwritten by asynchronous readiness',()=>{
 assert.match(html,/if\(params\.has\('auth_return'\)\)/);
 assert.match(html,/checkSession\(\)/);
 assert.match(html,/fetch\('\/api\/auth\/me',\{method:'GET',credentials:'same-origin'/);
 assert.match(html,/staffResponse\.ok/);
});
