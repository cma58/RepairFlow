'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withWorkspace}=require('../lib/workspace-session');
const {customer,checkout,stock,refurb,changeRepair,approveQuote,correction,repairDocument,receipt}=require('../lib/workspace-operations');
const O='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',A='44444444-4444-4444-8444-444444444442';
const P='55555555-5555-4555-8555-555555555555',F='66666666-6666-4666-8666-666666666666',R='77777777-7777-4777-8777-777777777777',S='88888888-8888-4888-8888-888888888888';
const staff={id:A,organizationId:O,branchId:B,role:'manager'};
function response(){return {headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}}
function boundary(role='manager'){
 const queries=[],client={release(){},async query(sql){queries.push(sql);
  if(sql.startsWith('SELECT current_user'))return {rows:[{name:'rf_runtime_login',bypass:false}]};
  if(sql.includes('FROM rf_staff s'))return {rows:[{id:A,organization_id:O,branch_id:B,role}]};
  return {rows:[]};
 }};
 const env={REPAIRFLOW_APP_ORIGIN:'https://preview.example',REPAIRFLOW_ORGANIZATION_ID:O,REPAIRFLOW_BRANCH_ID:B,REPAIRFLOW_RUNTIME_ROLE:'rf_runtime_login',REPAIRFLOW_RUNTIME_DATABASE_URL:'postgres://restricted'};
 return {queries,env,createPool:()=>({connect:async()=>client,end:async()=>{}})};
}
test('POST requires same origin, JSON and a verified cookie before a connection',async()=>{
 const b=boundary(),req={method:'POST',headers:{origin:'https://foreign.example','content-type':'application/json',cookie:'better-auth.session_token=test'},body:{action:'customer'}};
 const res=response();await withWorkspace(req,res,async()=>({body:{}}),{...b,authenticate:async()=>({subject:'user'})});
 assert.equal(res.statusCode,403);assert.equal(b.queries.length,0);
 req.headers.origin='https://preview.example';req.headers.cookie='';const res2=response();await withWorkspace(req,res2,async()=>({body:{}}),{...b,authenticate:async()=>({subject:'user'})});
 assert.equal(res2.statusCode,401);assert.equal(b.queries.length,0);
});
test('owner or manager operation stays in tenant transaction, sales denied',async()=>{
 const b=boundary(),req={method:'GET',headers:{cookie:'better-auth.session_token=test'}};
 const res=response();await withWorkspace(req,res,async(_db,user)=>({body:{role:user.role}}),{...b,authenticate:async()=>({subject:'verified-user'})});
 assert.equal(res.statusCode,200);assert.equal(res.body.role,'manager');assert.equal(b.queries[0],'BEGIN');assert.equal(b.queries.at(-1),'COMMIT');
 assert.ok(b.queries.some(sql=>sql.includes("set_config('app.subject'")));
 const owner=boundary('owner'),ownerRes=response();await withWorkspace(req,ownerRes,async(_db,user)=>({body:{role:user.role}}),{...owner,authenticate:async()=>({subject:'verified-owner'})});
 assert.equal(ownerRes.statusCode,200);assert.equal(ownerRes.body.role,'owner');
 const denied=boundary('sales'),res2=response();await withWorkspace(req,res2,async()=>{throw Error('must not run')},{...denied,authenticate:async()=>({subject:'verified-user'})});
 assert.equal(res2.statusCode,403);assert.equal(denied.queries.at(-1),'ROLLBACK');
});
test('failed operation rolls back and reveals no customer details',async()=>{
 const b=boundary(),res=response(),req={method:'GET',headers:{cookie:'better-auth.session_token=test'}};
 await withWorkspace(req,res,async()=>{throw Error('private customer record')},{...b,authenticate:async()=>({subject:'verified-user'})});
 assert.equal(res.statusCode,503);assert.deepEqual(res.body,{error:'workspace_unavailable'});assert.equal(b.queries.at(-1),'ROLLBACK');
});
function saleDb({previous=false,stockAmount=3,reservation=false}={}){
 const queries=[];const client={async query(sql,params=[]){queries.push({sql,params});
  if(sql.includes('FROM rf_sales WHERE organization_id=$1 AND request_id=$2'))return {rows:previous?[{id:S,reference:'KAS-old',total_cents:5000,request_hash:'wrong'}]:[]};
  if(sql.includes("AT TIME ZONE 'Europe/Brussels')::date AS date"))return {rows:[{date:'2026-11-08'}]};
  if(sql.includes('FROM rf_cash_days WHERE'))return {rows:[]};
  if(sql.includes('FROM rf_products p JOIN rf_stock_balances'))return {rows:[{name:'Hoesje',sku:'CASE',unit_price_cents:1000,active:true,quantity:stockAmount}]};
  if(sql.includes('coalesce(sum(quantity),0) AS amount FROM rf_part_reservations'))return {rows:[{amount:reservation?2:0}]};
  if(sql.includes("FROM rf_part_reservations WHERE")&&sql.includes('ORDER BY product_id,id'))return {rows:reservation?[{id:R,product_id:P,quantity:2}]:[]};
  if(sql.includes('FROM rf_refurbished WHERE'))return {rows:[{name:'iPhone',unit_price_cents:3000,status:'available'}]};
  if(sql.includes('FROM rf_repairs WHERE'))return {rows:[{name:'REP',charge_cents:1000,status:'Klaar'}]};
  if(sql.includes('coalesce(sum(l.line_total_cents)'))return {rows:[{amount:0}]};
  if(sql.startsWith('INSERT INTO rf_sales'))return {rows:[{id:S}]};
  return {rows:[],rowCount:1};
 }};return {client,queries};
}
const mixed={requestId:R,lines:[{type:'product',id:P,quantity:1},{type:'refurbished',id:F,quantity:1},{type:'repair',id:A,quantity:1}],payments:[{method:'cash',amountCents:2000},{method:'card',amountCents:3000,reference:'terminal-slip-1'}]};
test('combined cart records exact split payments, stock and refurb in one transaction',async()=>{
 const {client,queries}=saleDb();const result=await checkout(client,staff,mixed);
 assert.equal(result.body.sale.totalCents,5000);
 assert.equal(queries.filter(q=>q.sql.startsWith('INSERT INTO rf_sale_lines')).length,3);
 assert.equal(queries.filter(q=>q.sql.startsWith('INSERT INTO rf_sale_payments')).length,2);
 assert.equal(queries.filter(q=>q.sql.startsWith('INSERT INTO rf_stock_movements')).length,1);
 assert.equal(queries.filter(q=>q.sql.startsWith('UPDATE rf_refurbished')).length,1);
 assert.equal(queries.filter(q=>q.sql.startsWith('INSERT INTO rf_activity')).length,1);
 assert.equal(queries.filter(q=>q.sql.includes('payment_state')&&q.sql.includes('confirmed')).length,0);
});
test('stock shortage, missing card reference and idempotency conflict never create a sale',async()=>{
 for(const [input,options] of [[mixed,{stockAmount:0}],[{...mixed,payments:[{method:'card',amountCents:5000}]},{}],[mixed,{previous:true}]]){
  const {client,queries}=saleDb(options);await assert.rejects(()=>checkout(client,staff,input));
  assert.equal(queries.filter(q=>q.sql.startsWith('INSERT INTO rf_sales')).length,0);
 }
});
test('repair part reservation uses a request lock and refuses unavailable stock',async()=>{
 const queries=[];const db={async query(sql){queries.push(sql);
  if(sql.startsWith('SELECT product_id,repair_id,quantity'))return {rows:[]};
  if(sql.startsWith('SELECT status,charge_cents,quote_approved_at'))return {rows:[{status:'In reparatie',charge_cents:0,quote_approved_at:null}]};
  if(sql.startsWith('SELECT id FROM rf_products'))return {rows:[{id:P}]};
  if(sql.startsWith('SELECT quantity FROM rf_stock_balances'))return {rows:[{quantity:1}]};
  if(sql.includes('coalesce(sum(quantity),0) AS amount'))return {rows:[{amount:0}]};
  return {rows:[],rowCount:1};
 }};
 await assert.rejects(()=>stock(db,staff,{requestId:R,productId:P,quantity:2,operation:'reserve',repairId:F}),/INSUFFICIENT_STOCK/);
 assert.equal(queries.filter(sql=>sql.startsWith('INSERT INTO rf_part_reservations')).length,0);
});
test('checkout finalizes reserved repair parts only once with the sale',async()=>{
 const {client,queries}=saleDb({reservation:true,stockAmount:3});
 const repairOnly={requestId:R,lines:[{type:'repair',id:A,quantity:1}],payments:[{method:'cash',amountCents:1000}]};
 const result=await checkout(client,staff,repairOnly);
 assert.equal(result.body.sale.totalCents,1000);
 assert.equal(queries.filter(q=>q.sql.startsWith('UPDATE rf_part_reservations')&&q.sql.includes("status='consumed'")).length,1);
 assert.equal(queries.filter(q=>q.sql.startsWith('INSERT INTO rf_stock_movements')&&q.sql.includes('repair_id')).length,1);
});
test('free pickup consumes reserved parts transactionally, cancellation releases them',async()=>{
 const events=[];const db={async query(sql){events.push(sql);
  if(sql.startsWith('SELECT id,status,charge_cents'))return {rows:[{id:R,status:'Klaar',charge_cents:0}]};
  if(sql.includes("FROM rf_part_reservations WHERE")&&sql.includes('ORDER BY product_id,id'))return {rows:[{id:F,product_id:P,quantity:1}]};
  return {rows:[],rowCount:1};
 }};
 await changeRepair(db,staff,{repairId:R,expectedStatus:'Klaar',status:'Afgehaald'});
 assert.ok(events.some(sql=>sql.includes("status='consumed'")));
 assert.ok(events.some(sql=>sql.startsWith('INSERT INTO rf_stock_movements')&&sql.includes('repair_id')));
 const cancelled=[],cancelDb={async query(sql){cancelled.push(sql);if(sql.startsWith('SELECT id,status,charge_cents'))return {rows:[{id:R,status:'In reparatie',charge_cents:0}]};if(sql.includes("FROM rf_part_reservations WHERE")&&sql.includes("status='reserved' FOR UPDATE"))return {rows:[{id:F}]};return {rows:[],rowCount:1}}};
 await changeRepair(cancelDb,staff,{repairId:R,expectedStatus:'In reparatie',status:'Geannuleerd',reason:'Klant annuleert de herstelling'});
 assert.ok(cancelled.some(sql=>sql.includes("status='released'")));
});
test('pickup requires full repair charge and exact status',async()=>{
 const db={async query(sql){if(sql.startsWith('SELECT id,status,charge_cents'))return {rows:[{id:R,status:'Klaar',charge_cents:10000}]};if(sql.includes('coalesce(sum(l.line_total_cents)'))return {rows:[{amount:5000}]};throw Error('unexpected write')}};
 await assert.rejects(()=>changeRepair(db,staff,{repairId:R,expectedStatus:'Klaar',status:'Afgehaald'}),/CONFLICT/);
});
test('QC cannot mark a repair ready without explicit passed test',async()=>{
 const db={query(){throw Error('database should not be reached')}};
 await assert.rejects(()=>changeRepair(db,staff,{repairId:R,expectedStatus:'Kwaliteitscontrole',status:'Klaar'}),/INVALID_INPUT/);
 await assert.rejects(()=>changeRepair(db,staff,{repairId:R,expectedStatus:'Kwaliteitscontrole',status:'In reparatie',qcNote:'x'}),/INVALID_INPUT/);
});
test('paid repair cannot start without approval for its exact charge',async()=>{
 const writes=[];const db={async query(sql){writes.push(sql);return {rows:[{id:R,status:'Diagnose',charge_cents:5000,quote_approved_at:null,quote_approved_charge_cents:null}]}}};
 await assert.rejects(()=>changeRepair(db,staff,{repairId:R,expectedStatus:'Diagnose',status:'In reparatie'}),/CONFLICT/);
 assert.equal(writes.filter(sql=>sql.startsWith('UPDATE')).length,0);
 const mismatch={async query(sql){writes.push(sql);return {rows:[{id:R,status:'Wachten op klant',charge_cents:6000,quote_approved_at:new Date(),quote_approved_charge_cents:5000}]}}};
 await assert.rejects(()=>changeRepair(mismatch,staff,{repairId:R,expectedStatus:'Wachten op klant',status:'In reparatie'}),/CONFLICT/);
});
test('quote approval records method, evidence, actor and agreed amount',async()=>{
 const calls=[],db={async query(sql,params){calls.push({sql,params});if(sql.startsWith('SELECT id,status,charge_cents,quote_approved_at'))return {rows:[{id:R,status:'Wachten op klant',charge_cents:5000,quote_approved_at:null}]};return {rows:[]}}};
 const result=await approveQuote(db,staff,{repairId:R,method:'oral',note:'Customer accepted scope and 50 EUR by phone'});
 assert.equal(result.body.approved,true);
 assert.ok(calls.some(c=>c.sql.startsWith('UPDATE rf_repairs')&&c.params[3]===A));
 assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO rf_activity')&&c.params[3]==='repair.quote_approved'));
});
test('quote approval and part reservation share the same transaction work',async()=>{
 const calls=[],db={async query(sql,params){calls.push({sql,params});if(sql.startsWith('SELECT id,status,charge_cents,quote_approved_at'))return {rows:[{id:A,status:'Wachten op klant',charge_cents:5000,quote_approved_at:null}]};if(sql.startsWith('SELECT product_id,repair_id,quantity'))return {rows:[]};if(sql.startsWith('SELECT status,charge_cents,quote_approved_at'))return {rows:[{status:'Wachten op klant',charge_cents:5000,quote_approved_at:new Date()}]};if(sql.startsWith('SELECT id FROM rf_products'))return {rows:[{id:P}]};if(sql.startsWith('SELECT quantity FROM rf_stock_balances'))return {rows:[{quantity:2}]};if(sql.includes('coalesce(sum(quantity),0) AS amount'))return {rows:[{amount:0}]};if(sql.startsWith('INSERT INTO rf_part_reservations'))return {rows:[{id:F}]};return {rows:[],rowCount:1}}};
 await approveQuote(db,staff,{repairId:A,method:'oral',note:'Customer agreed to repair and one part',partProductId:P,partQuantity:1,partRequestId:R});
 assert.equal(calls.filter(x=>x.sql.startsWith('INSERT INTO rf_part_reservations')).length,1);
 assert.equal(calls.filter(x=>x.sql.startsWith('INSERT INTO rf_stock_movements')).length,0);
});
test('refurbished registration rejects invalid IMEI checksum before database access',async()=>{
 const db={query(){throw Error('database must not be reached')}};
 await assert.rejects(()=>refurb(db,staff,{requestId:R,imei:'990000000000004',description:'Test',priceCents:10000}),/INVALID_INPUT/);
});
test('valid IMEI registration checks shared product catalogue for duplicates',async()=>{
 const queries=[],db={async query(sql){queries.push(sql);if(sql.includes('FROM rf_products WHERE'))return {rows:[{id:P}]};return {rows:[]}}};
 await assert.rejects(()=>refurb(db,staff,{requestId:R,imei:'990000000000002',description:'Test',priceCents:10000}),/CONFLICT/);
 assert.equal(queries.filter(sql=>sql.startsWith('INSERT INTO rf_refurbished')).length,0);
});
test('business customer requires a billing address and retains VAT as supplied',async()=>{
 const queries=[],db={async query(sql,params){queries.push({sql,params});if(sql.startsWith('INSERT INTO rf_customers'))return {rows:[{id:R,display_name:'Contact',email:null,phone:null,customer_type:'business',company_name:'Company',vat_number:'BE0123456789',billing_address:'Street 1'}]};return {rows:[]}}};
 await assert.rejects(()=>customer(db,staff,{requestId:R,type:'business',name:'Contact',company:'Company',vat:'BE0123456789'}),/INVALID_INPUT/);
 assert.equal(queries.length,0);
 const result=await customer(db,staff,{requestId:R,type:'business',name:'Contact',company:'Company',vat:'BE0123456789',billingAddress:'Street 1'});
 assert.equal(result.body.customer.vat_number,'BE0123456789');assert.equal(queries.filter(x=>x.sql.startsWith('INSERT INTO rf_activity')).length,1);
});
test('cash correction cannot make a closed day negative, and replay does not apply twice',async()=>{
 const calls=[];let replay=false;const db={async query(sql){calls.push(sql);
  if(sql.startsWith('SELECT id,total_cents FROM rf_cash_days'))return {rows:[{id:F,total_cents:100}]};
  if(sql.startsWith('SELECT id,day_id,delta_cents,reason'))return {rows:replay?[{id:S,day_id:F,delta_cents:-100,reason:'Counting error'}]:[]};
  if(sql.startsWith('SELECT coalesce(sum(delta_cents)'))return {rows:[{cents:0}]};
  return {rows:[{id:S}]};
 }};
 await assert.rejects(()=>correction(db,staff,{requestId:R,dayId:F,deltaCents:-101,reason:'Counting error'}),/CONFLICT/);
 assert.equal(calls.filter(sql=>sql.startsWith('INSERT INTO rf_cash_corrections')).length,0);
 replay=true;const result=await correction(db,staff,{requestId:R,dayId:F,deltaCents:-100,reason:'Counting error'});
 assert.equal(result.body.replayed,true);assert.equal(calls.filter(sql=>sql.startsWith('INSERT INTO rf_cash_corrections')).length,0);
 assert.equal(calls.filter(sql=>sql.startsWith('SELECT pg_advisory_xact_lock')).length,2);
 assert.equal(calls.some(sql=>sql.includes('rf_cash_days')&&sql.includes('FOR UPDATE')),false);
});
test('printable repair document does not read customer data when tenant repair is absent',async()=>{
 const calls=[],db={async query(sql,params){calls.push({sql,params});return {rows:[]}}};
 await assert.rejects(()=>repairDocument(db,staff,{repairId:R}),/NOT_FOUND/);
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].params,[O,B,R]);
});
test('sale receipt reads only lines, payments and company details after scoped sale lookup',async()=>{
 const calls=[],db={async query(sql,params){calls.push({sql,params});if(sql.startsWith('SELECT id,reference,total_cents,sold_at'))return {rows:[{id:S,reference:'KAS-TEST',total_cents:16000,sold_at:'2026-11-08T12:00:00Z'}]};if(sql.startsWith('SELECT name FROM rf_organizations'))return {rows:[{name:'PHIXAR'}]};if(sql.startsWith('SELECT name,address FROM rf_branches'))return {rows:[{name:'Testvestiging',address:'Testadres'}]};return {rows:[]}}};
 const result=await receipt(db,staff,{saleId:S});assert.equal(result.body.sale.total_cents,16000);assert.equal(result.body.organization.name,'PHIXAR');assert.match(result.body.notice,/geen fiscale factuur/i);
 assert.deepEqual(calls[0].params,[O,B,S]);
});
