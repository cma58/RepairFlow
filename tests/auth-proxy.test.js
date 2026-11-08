'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('no public Neon Auth proxy routes to a fixed production endpoint',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../vercel.json'),'utf8'));
 const proxy=config.rewrites.filter(x=>x.source.startsWith('/neon-auth'));
 assert.equal(proxy.length,0);
 assert.doesNotMatch(JSON.stringify(config),/ep-rough-cake-ba03t8v8/);
});
