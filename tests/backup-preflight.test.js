'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspectBackup}=require('../lib/backup-preflight');
const pack=keys=>JSON.stringify({format:'RepairFlow-browser-backup',version:1,keys});
test('counts known modules without revealing customer details',()=>{
 const data=pack({rf07v3:JSON.stringify({'PHX-1':{name:'PRIVACY',phone:'SECRET'}}),rfCustomersV1:JSON.stringify([{name:'PERSON'}]),rfPosSalesV1:'[]'});
 const result=inspectBackup(data);
 assert.equal(result.modules.find(m=>m.key==='rf07v3').count,1);
 assert.equal(result.modules.find(m=>m.key==='rfCustomersV1').count,1);
 assert.equal(result.readOnly,true);
 assert.doesNotMatch(JSON.stringify(result),/PRIVACY|SECRET|PERSON/);
});
test('rejects invalid format and invalid key',()=>{
 assert.throws(()=>inspectBackup('{}'),/herkenbare/);
 assert.throws(()=>inspectBackup(pack({'../../secret':'{}'})),/back-upvelden/);
});
test('warns on malformed module without attempting import',()=>{
 const result=inspectBackup(pack({rf07v3:'not json'}));
 assert.equal(result.modules.find(m=>m.key==='rf07v3').validJson,false);
 assert.ok(result.warnings.length);
});
test('unexpected modules are counted without exposing content',()=>{
 const result=inspectBackup(pack({rf07v3:'{}',rfUnknownV1:JSON.stringify({secret:'PRIVATE'})}));
 assert.equal(result.unexpectedKeys,1);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
