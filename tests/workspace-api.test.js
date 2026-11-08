'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withWorkspace}=require('../lib/workspace-session');
const {checkout,stock,refurb,changeRepair}=require('../lib/workspace-operations');
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
 const denied=boundary('sales'),res2=response();await withWorkspace(req,res2,async()=>{throw Error('must not run')},{...denied,authenticate:async()=>({subject:'verified-user'})});
 assert.equal(res2.statusCode,403);assert.equal(denied.queries.at(-1),'ROLLBACK');
});
test('failed operation rolls back and reveals no customer details',async()=>{
 const b=boundary(),res=response(),req={method:'GET',headers:{cookie:'better-auth.session_token=test'}};
 await withWorkspace(req,res,async()=>{throw Error('private customer record')},{...b,authenticate:async()=>({subject:'verified-user'})});
 assert.equal(res.statusCode,503);assert.deepEqual(res.body,{error:'workspace_unavailable'});assert.equal(b.queries.at(-1),'ROLLBACK');
});
function saleDb({previous=false,stockAmount=3}={}){
 const queries=[];const client={async query(sql,params=[]){queries.push({sql,params});
  if(sql.includes('FROM rf_sales WHERE organization_id=$1 AND request_id=$2'))return {rows:previous?[{id:S,reference:'KAS-old',total_cents:5000,request_hash:'wrong'}]:[]};
  if(sql.includes("AT TIME ZONE 'Europe/Brussels')::date AS date"))return {rows:[{date:'2026-11-08'}]};
  if(sql.includes('FROM rf_cash_days WHERE'))return {rows:[]};
  if(sql.includes('FROM rf_products p JOIN rf_stock_balances'))return {rows:[{name:'Hoesje',sku:'CASE',unit_price_cents:1000,active:true,quantity:stockAmount}]};
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
test('repair part consumption uses a request lock and refuses negative balances',async()=>{
 const queries=[];const db={async query(sql){queries.push(sql);
  if(sql.startsWith('SELECT product_id,repair_id'))return {rows:[]};
  if(sql.startsWith('SELECT status FROM rf_repairs'))return {rows:[{status:'In reparatie'}]};
  if(sql.startsWith('SELECT id FROM rf_products'))return {rows:[{id:P}]};
  if(sql.startsWith('UPDATE rf_stock_balances'))return {rows:[]};
  return {rows:[],rowCount:1};
 }};
 await assert.rejects(()=>stock(db,staff,{requestId:R,productId:P,quantity:2,operation:'consume',repairId:F}),/INSUFFICIENT_STOCK/);
 assert.equal(queries.filter(sql=>sql.startsWith('INSERT INTO rf_stock_movements')).length,0);
});
test('pickup requires full repair charge and exact status',async()=>{
 const db={async query(sql){if(sql.startsWith('SELECT id,status,charge_cents'))return {rows:[{id:R,status:'Klaar',charge_cents:10000}]};if(sql.includes('coalesce(sum(l.line_total_cents)'))return {rows:[{amount:5000}]};throw Error('unexpected write')}};
 await assert.rejects(()=>changeRepair(db,staff,{repairId:R,expectedStatus:'Klaar',status:'Afgehaald'}),/CONFLICT/);
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
