'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app-v3.js'),'utf8');
const start=source.indexOf("else if(x==='pickup'){");
const end=source.indexOf("\nelse if(x==='repair-doc-create')",start);
assert.ok(start>=0&&end>start,'Pickup handler missing');
const handler=source.slice(start+5,end);
function run({status='Klaar',balance=0,qc=true,accept=true,saveFails=false}={}){
 const r={status,qcComplete:qc,unlock:'1234',warranty:false,audit:[],payments:[]};
 const repairs={R1:r};let printed=0,details=0,saved=0,confirmations=0,message='';
 const ctx={x:'pickup',repairs,a:{dataset:{ticket:'R1'}},due:()=>balance,confirm:()=>{confirmations++;return accept},setStatus:(obj,next)=>{obj.status=next;obj.audit.unshift({action:'Status gewijzigd'});return true},log:(obj,action)=>obj.audit.unshift({action}),save:()=>{saved++;if(saveFails)throw Error('QuotaExceededError')},detail:()=>{details++},paymentReceipt:()=>{printed++},toast:m=>{message=m},rfPaymentReturnTicket:'R1',JSON};
 vm.createContext(ctx);vm.runInContext('(function(){'+handler+'})()',ctx);
 return {r:repairs.R1,printed,details,saved,confirmations,message};
}
test('successful handover starts warranty and opens receipt',()=>{
 const x=run();assert.equal(x.r.status,'Afgehaald');assert.equal(x.r.warranty,true);assert.equal(x.r.unlock,'');assert.equal(x.saved,1);assert.equal(x.printed,1);
});
test('storage failure rolls back status, warranty, unlock and audit',()=>{
 const x=run({saveFails:true});assert.equal(x.r.status,'Klaar');assert.equal(x.r.warranty,false);assert.equal(x.r.unlock,'1234');assert.equal(x.r.audit.length,0);assert.equal(x.printed,0);assert.equal(x.details,0);assert.match(x.message,/Opslaan mislukt/);
});
test('declined handover does not change repair',()=>{
 const x=run({accept:false});assert.equal(x.saved,0);assert.equal(x.r.status,'Klaar');assert.equal(x.printed,0);
});
test('unpaid or untested device cannot be handed over',()=>{
 for(const opts of [{balance:20},{qc:false},{status:'In behandeling'}]){const x=run(opts);assert.equal(x.saved,0);assert.equal(x.confirmations,0);assert.equal(x.r.status,opts.status||'Klaar');}
});
