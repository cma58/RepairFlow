'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('Neon Auth proxy is restricted to read-only session endpoint',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../vercel.json'),'utf8'));
 const proxy=config.rewrites.filter(x=>x.source.startsWith('/neon-auth'));
 assert.equal(proxy.length,1);
 assert.equal(proxy[0].source,'/neon-auth/get-session');
 assert.match(proxy[0].destination,/\/neondb\/auth\/get-session$/);
});
