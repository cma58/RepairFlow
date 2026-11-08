'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('shop entry serves the authorized workspace without running legacy browser-store scripts',()=>{
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const workspace=fs.readFileSync(path.join(root,'workspace.html'),'utf8');
 assert.equal(index,workspace);
 assert.match(index,/src="\/workspace-shell\.js"/);
 assert.match(index,/src="\/workspace\.js"/);
 assert.doesNotMatch(index,/src="\/(?:app-v07|repairflow-erp-pos|repairflow-next)\.js"/);
 assert.match(fs.readFileSync(path.join(root,'v07.html'),'utf8'),/src="\/app-v07\.js"/);
});
