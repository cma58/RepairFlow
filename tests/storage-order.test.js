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
 const context={repairs:{new:'repair'},inventory:{new:'stock'},repairStorageCorrupt:false,JSON,localStorage:{getItem:key=>persisted[key]??null,removeItem:key=>{delete persisted[key]},setItem(key,value){calls.push(key);if(key===failKey)throw Error('QuotaExceededError');persisted[key]=value;}}};
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
 const x=simulate('rf07v3');assert.ok(x.error);assert.equal(x.persisted.rf07v3,'{"old":"repair"}');assert.equal(x.persisted.rfInventoryV3,'{"old":"stock"}');
});
test('corrupt repair data blocks writes and preserves original bytes',()=>{
 const persisted={rf07v3:'{broken',rfInventoryV3:'{"old":"stock"}'};
 const ctx={repairs:{new:'repair'},inventory:{new:'stock'},repairStorageCorrupt:true,JSON,localStorage:{getItem:k=>persisted[k]??null,setItem(){throw Error('must not write')}}};
 assert.throws(()=>vm.runInNewContext(code+'\nsave()',ctx),/CORRUPT_REPAIR_DATA/);
 assert.equal(persisted.rf07v3,'{broken');
});
test('corrupt current repairs never fall back to older data',()=>{
 const begin=src.indexOf('let repairStorageCorrupt=false;'),end=src.indexOf('/* Shared POS stock',begin);
 const persisted={rf07v3:'{broken',rf07v2:'{"old":{"name":"Should not replace current"}}',rfInventoryV3:'{}'};
 const ctx={localStorage:{getItem:k=>persisted[k]??null,setItem(){throw Error('bootstrap wrote data')}},JSON,structuredClone,DEFAULT_INVENTORY:{},seed:()=>({})};
 assert.equal(vm.runInNewContext(src.slice(begin,end)+'\nrepairStorageCorrupt',ctx),true);
 assert.equal(persisted.rf07v3,'{broken');
});
