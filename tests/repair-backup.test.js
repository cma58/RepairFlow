'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app-v3.js'),'utf8');
const start=source.indexOf('function exportRepairBackup(){');
const end=source.indexOf('\nfunction log(r,action',start);
assert.ok(start>=0&&end>start,'Export function not found');
const code=source.slice(start,end);
function run({allow=true,repairs='{"REP-1":{"name":"Test","payments":[{"amount":40}]}}',inventory='{"part":{"qty":2}}'}={}){
 let clicked=0,blobContent=null,filename='',notice='';
 const link={href:'',set download(v){filename=v},click(){clicked++},remove(){}};
 const ctx={confirm:()=>allow,localStorage:{getItem:k=>k==='rf07v3'?repairs:inventory},Blob:class{constructor(parts){blobContent=parts.join('')}},URL:{createObjectURL:()=> 'blob:backup',revokeObjectURL:()=>{}},document:{createElement:()=>link,body:{appendChild(){}}},setTimeout:()=>{},toast:m=>{notice=m},Date,JSON};
 vm.createContext(ctx);vm.runInContext(code+'\nexportRepairBackup()',ctx);
 return {clicked,blobContent,filename,notice};
}
test('backup contains repairs, payments and inventory without modification',()=>{
 const x=run();assert.equal(x.clicked,1);assert.match(x.filename,/^repairflow-backup-\d{4}-\d{2}-\d{2}\.json$/);
 const obj=JSON.parse(x.blobContent);assert.equal(obj.format,'repairflow-local-backup');assert.equal(obj.version,1);assert.equal(obj.repairs['REP-1'].payments[0].amount,40);assert.equal(obj.inventory.part.qty,2);
});
test('declining sensitive data warning prevents download',()=>{
 const x=run({allow:false});assert.equal(x.clicked,0);assert.equal(x.blobContent,null);
});
test('corrupted local data does not produce partial backup',()=>{
 assert.throws(()=>run({repairs:'{bad-json'}),SyntaxError);
});
