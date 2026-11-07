'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app-v3.js'),'utf8');
const start=src.indexOf('function save(){');
const end=src.indexOf('\nfunction exportRepairBackup()',start);
assert.ok(start>=0&&end>start);
const code=src.slice(start,end);
function simulate(failKey){
 const persisted={rf07v3:'{"old":"repair"}',rfInventoryV3:'{"old":"stock"}'};
 const calls=[];
 const context={repairs:{new:'repair'},inventory:{new:'stock'},JSON,localStorage:{setItem(key,value){calls.push(key);if(key===failKey)throw Error('QuotaExceededError');persisted[key]=value;}}};
 vm.createContext(context);
 let error=null;
 try{vm.runInContext(code+'\nsave()',context)}catch(e){error=e}
 return {persisted,calls,error};
}
test('repairs persist last after inventory write succeeds',()=>{
 const x=simulate();assert.deepEqual(x.calls,['rfInventoryV3','rf07v3']);assert.equal(JSON.parse(x.persisted.rf07v3).new,'repair');
});
test('failed inventory write leaves previous repairs intact',()=>{
 const x=simulate('rfInventoryV3');assert.ok(x.error);assert.equal(x.persisted.rf07v3,'{"old":"repair"}');
});
test('failed repairs write leaves previous repairs intact',()=>{
 const x=simulate('rf07v3');assert.ok(x.error);assert.equal(x.persisted.rf07v3,'{"old":"repair"}');
});
