'use strict';
// Regression test for phase-3 review finding F5 (clickjacking): every response must
// forbid cross-origin framing. Same-origin framing stays allowed because the existing
// tests/e2e/repair-phase21.html runner embeds app pages in an iframe.
const test=require('node:test');const assert=require('node:assert/strict');
const config=require('../vercel.json');
test('vercel.json forbids cross-origin framing and MIME sniffing on all routes',()=>{
 const all=config.headers.find(h=>h.source==='/(.*)');assert.ok(all,'catch-all header rule');
 const h=Object.fromEntries(all.headers.map(x=>[x.key.toLowerCase(),x.value]));
 assert.equal(h['x-frame-options'],'SAMEORIGIN');
 assert.match(h['content-security-policy'],/frame-ancestors 'self'/);
 assert.doesNotMatch(h['content-security-policy'],/frame-ancestors[^;]*\*/);
 assert.equal(h['x-content-type-options'],'nosniff');
 assert.ok(h['referrer-policy']);
});
test('existing routing settings are unchanged',()=>{assert.equal(config.cleanUrls,true);assert.equal(config.trailingSlash,false);assert.deepEqual(config.rewrites,[])});
