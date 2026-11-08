'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app-customers-v1.js'),'utf8');
const start=source.indexOf('  function mergeCustomersSafely('),end=source.indexOf('\n  function newCustomer(',start);
assert.ok(start>=0&&end>start);
const mergeCode=source.slice(start,end);
function setup(failKey){
 const customer=(id,device)=>({id,name:id,contacts:[],notes:[],communications:[],audit:[{action:'Original '+id}],devices:[{id:device,brandModel:'Same model',serial:id}]});
 const customers={A:customer('A','D1'),B:customer('B','D2')},repairs={R1:{customerId:'B'}};
 const persisted={rfCustomersV1:JSON.stringify(customers),rf07v3:JSON.stringify(repairs),rfPosSalesV1:JSON.stringify([{id:'S1',customerId:'B'}]),rfRefurbV1:JSON.stringify([{id:'F1',sale:{customerId:'B'}}])};
 const before=structuredClone(persisted),messages=[];
 let failed=false;
 const localStorage={getItem:key=>persisted[key]??null,removeItem:key=>{delete persisted[key]},setItem:(key,value)=>{if(key===failKey&&!failed){failed=true;throw Error('storage failure')}persisted[key]=value}};
 const ctx={customers,repairs,customerStorageCorrupt:false,repairStorageCorrupt:false,KEY:'rfCustomersV1',localStorage,structuredClone,JSON,Map,cAudit:()=>({action:'Merge'}),toast:m=>messages.push(m)};
 const result=vm.runInNewContext(mergeCode+'\nmergeCustomersSafely("A","B")',ctx);
 return {result,persisted,before,messages,ctx};
}
test('customer merge keeps every device and relinks repairs, POS and refurbished sales',()=>{
 const x=setup();assert.equal(x.result,true);
 const customers=JSON.parse(x.persisted.rfCustomersV1);
 assert.equal(customers.B,undefined);assert.deepEqual(customers.A.devices.map(d=>d.id),['D1','D2']);
 assert.equal(customers.A.audit.length,3);
 assert.equal(JSON.parse(x.persisted.rf07v3).R1.customerId,'A');
 assert.equal(JSON.parse(x.persisted.rfPosSalesV1)[0].customerId,'A');
 assert.equal(JSON.parse(x.persisted.rfRefurbV1)[0].sale.customerId,'A');
});
test('failed customer merge restores all original storage and in-memory links',()=>{
 const x=setup('rfPosSalesV1');assert.equal(x.result,false);
 assert.deepEqual(x.persisted,x.before);
 assert.equal(x.ctx.repairs.R1.customerId,'B');
 assert.ok(x.ctx.customers.B);
 assert.match(x.messages.join(' '),/hersteld/);
});
test('invalid linked sales block merge before any write',()=>{
 const x=setup();x.persisted.rfPosSalesV1='{broken';const original=structuredClone(x.persisted);
 const result=vm.runInNewContext(mergeCode+'\nmergeCustomersSafely("A","B")',x.ctx);
 assert.equal(result,false);assert.deepEqual(x.persisted,original);
});
