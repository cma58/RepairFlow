'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {checkout,validateCheckout}=require('../lib/pos-checkout');
const O='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',
 A='33333333-3333-4333-8333-333333333333',R='44444444-4444-4444-8444-444444444444',
 P='55555555-5555-4555-8555-555555555555',S='66666666-6666-4666-8666-666666666666';
const request={organizationId:O,branchId:B,actorId:A,requestId:R,lines:[{productId:P,quantity:2}],paymentMethod:'cash'};
function mock({existing=false,stock=5,price=1250}={}){
 const calls=[];
 const client={async query(sql,params=[]){
  calls.push({sql,params});
  if(sql.startsWith('SELECT id,reference,total_cents FROM rf_sales'))return {rows:existing?[{id:S,reference:'KAS-old',total_cents:2500}]:[]};
  if(sql.includes('FROM rf_products p JOIN'))return {rows:[{id:P,name:'Case',sku:'CASE-1',unit_price_cents:price,quantity:stock,active:true}]};
  if(sql.includes('INSERT INTO rf_sales'))return {rows:[{id:S}]};
  return {rows:[],rowCount:1};
 }};
 return {client,calls};
}
test('validates tenant and unique product lines',()=>{
 assert.throws(()=>validateCheckout({...request,organizationId:'x'}),/INVALID_CONTEXT/);
 assert.throws(()=>validateCheckout({...request,lines:[...request.lines,...request.lines]}),/INVALID_LINES/);
});
test('commits sale, stock, audit movement and recorded payment atomically',async()=>{
 const {client,calls}=mock();
 const result=await checkout(client,request);
 assert.equal(result.totalCents,2500);assert.equal(result.replayed,false);
 assert.equal(calls[0].sql,'BEGIN');assert.equal(calls.at(-1).sql,'COMMIT');
 assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO rf_sale_lines')).length,1);
 assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO rf_stock_movements')).length,1);
 assert.ok(calls.some(c=>c.sql.includes("'recorded'")));
});
test('same request returns existing sale without changing stock',async()=>{
 const {client,calls}=mock({existing:true});
 const result=await checkout(client,request);
 assert.equal(result.replayed,true);
 assert.equal(calls.filter(c=>c.sql.includes('UPDATE rf_stock_balances')).length,0);
});
test('insufficient stock rolls back with no sale',async()=>{
 const {client,calls}=mock({stock:1});
 await assert.rejects(()=>checkout(client,request),/INSUFFICIENT_STOCK/);
 assert.equal(calls.at(-1).sql,'ROLLBACK');
 assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO rf_sales')).length,0);
});

test('invalid database stock balance fails closed and rolls back',async()=>{
 for(const stock of [null,'invalid',-1,1.5,Number.MAX_SAFE_INTEGER+1]){
  const {client,calls}=mock({stock});
  await assert.rejects(()=>checkout(client,request),/INVALID_STOCK/);
  assert.equal(calls.at(-1).sql,'ROLLBACK');
  assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO rf_sales')).length,0);
 }
});
