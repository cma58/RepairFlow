'use strict';
// Opt-in real deployment E2E. Run only against an authorized isolated preview.
// No session values, response bodies or customer data are printed.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=process.env.PHIXAR_E2E_BASE_URL,cookie=process.env.PHIXAR_E2E_SESSION_COOKIE;
const enabled=process.env.PHIXAR_E2E_ISOLATED==='true'&&!!base&&!!cookie;
const synthetic=new Set(['11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333:44444444-4444-4444-8444-444444444444']);
test('real isolated cloud: customer → free repair → QC → pickup persists after reload',{skip:!enabled},async()=>{
 const url=new URL(base);assert.equal(url.protocol,'https:');assert.ok(url.hostname==='repair-flow-git-feature-cust-458be2-aminechtaiti-3069s-projects.vercel.app'||/^repair-flow-[a-z0-9]+-aminechtaiti-3069s-projects\.vercel\.app$/.test(url.hostname),'only this project preview or its fixed development alias is permitted');assert.equal(url.pathname,'/');
 async function request(path='',body){const r=await fetch(url.origin+'/api/workspace'+path,{method:body?'POST':'GET',redirect:'error',headers:{Cookie:cookie,Accept:'application/json',...(body?{Origin:url.origin,'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,'isolated API request failed with HTTP '+r.status);return r.json()}
 const before=await request();assert.ok(synthetic.has(before.context.organizationId+':'+before.context.branchId),'write blocked outside allowlisted synthetic organization/branch');
 const marker='E2E-SYNTHETIC-'+crypto.randomUUID();
 const customer=await request('',{action:'customer',requestId:crypto.randomUUID(),type:'individual',name:marker,email:'',phone:''});
 const created=await request('',{action:'repair',requestId:crypto.randomUUID(),customerId:customer.customer.id,brand:'Synthetic',model:'E2E fixture',serial:marker,complaint:'Synthetic no-charge diagnostic fixture',chargeCents:0});
 const id=created.repair.id;
 for(const [expectedStatus,status,extra] of [['Binnengebracht','Diagnose',{}],['Diagnose','In reparatie',{}],['In reparatie','Kwaliteitscontrole',{}],['Kwaliteitscontrole','Klaar',{testPassed:true}],['Klaar','Afgehaald',{}]])await request('',{action:'changeRepair',repairId:id,expectedStatus,status,...extra});
 const found=await request('?q='+encodeURIComponent(marker));assert.ok(found.results.repairs.some(r=>r.id===id&&r.status==='Afgehaald'));
 const doc=await request('?repairId='+encodeURIComponent(id));assert.equal(doc.repair.status,'Afgehaald');assert.equal(doc.customer.display_name,marker);assert.equal(doc.events.length,5);assert.match(doc.notice,/geen fiscale factuur/i);
});
