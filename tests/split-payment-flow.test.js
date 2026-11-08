'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app-v3.js'),'utf8');
function extract(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'Payment function not found');return source.slice(a,b);}
const paymentCode=extract('function paymentForm(ticket){','\nfunction renderTicketQR(ticket)');
const confirmCode=extract('function confirmPayment(ticket,amount,type,method){','\nrepairShell();save();');
function harness(){
 const repairs={R1:{payments:[],quotes:[{amount:688}],name:'Testklant',device:'Testtoestel',status:'Klaar',qcComplete:true}};
 let overlayHtml='',message='',saved=0;
 const context={repairs,rfPaymentReturnTicket:null,rfBusiness:()=>({legalName:'PHIXAR',street:'Teststraat',city:'Gent'}),overlay:(title,html)=>{overlayHtml=html;},due:r=>Math.max(0,688-r.payments.reduce((sum,p)=>sum+(p.status==='confirmed'?p.amount:0),0)),quoteAmount:()=>688,paidTotal:r=>r.payments.reduce((sum,p)=>sum+p.amount,0),euro:n=>'€ '+n.toFixed(2),esc:x=>String(x),uid:()=>String(Math.random()),now:()=>new Date().toISOString(),log:()=>{},save:()=>{saved++;},toast:m=>{message=m;},Date,Object,Number,Math};
 vm.createContext(context);vm.runInContext(paymentCode+'\n'+confirmCode,context);
 return {context,repairs,get html(){return overlayHtml;},get message(){return message;},get saved(){return saved;}};
}
test('split Bancontact and cash payments stay in same payment flow',()=>{
 const h=harness();h.context.confirmPayment('R1',300,'Betaling','Bancontact');
 assert.equal(h.saved,1);assert.equal(h.context.rfPaymentReturnTicket,'R1');assert.match(h.html,/388\.00/);assert.match(h.html,/Bancontact/);assert.match(h.html,/Betaling registreren/);
 h.context.confirmPayment('R1',388,'Betaling','Cash');
 assert.equal(h.saved,2);assert.equal(h.repairs.R1.payments.length,2);assert.match(h.html,/Volledig betaald/);assert.doesNotMatch(h.html,/id="payAmount"/);assert.match(h.html,/Betalingsoverzicht afdrukken/);assert.match(h.html,/Toestel afgehaald bevestigen/);
});
test('printable payment summary shows both methods and remaining balance',()=>{
 const h=harness();h.context.confirmPayment('R1',300,'Betaling','Bancontact');h.context.confirmPayment('R1',388,'Betaling','Cash');
 h.context.paymentReceipt('R1');
 assert.match(h.html,/Betalingsoverzicht/);assert.match(h.html,/Bancontact/);assert.match(h.html,/Cash/);assert.match(h.html,/€ 300\.00/);assert.match(h.html,/€ 388\.00/);assert.match(h.html,/Open saldo: <b>€ 0\.00<\/b>/);assert.match(h.html,/geen btw-factuur/);
 assert.equal(h.context.rfPaymentReturnTicket,'R1');
});
test('pickup shortcut is hidden before successful QC',()=>{
 const h=harness();h.repairs.R1.qcComplete=false;h.context.confirmPayment('R1',688,'Betaling','Cash');
 assert.doesNotMatch(h.html,/Toestel afgehaald bevestigen/);
});
test('payment exceeding balance is rejected and not saved',()=>{
 const h=harness();h.context.confirmPayment('R1',689,'Betaling','Cash');
 assert.equal(h.saved,0);assert.equal(h.repairs.R1.payments.length,0);assert.match(h.message,/groter zijn dan open saldo/);
});
test('payment form returns to same repair ticket',()=>{
 const h=harness();h.context.paymentForm('R1');
 assert.equal(h.context.rfPaymentReturnTicket,'R1');assert.match(h.html,/Terug naar afhaling/);
});
