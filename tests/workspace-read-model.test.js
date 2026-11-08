'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {search,dashboard,searchTerm,like}=require('../lib/workspace-read-model');
const s={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',organizationId:'11111111-1111-4111-8111-111111111111',branchId:'22222222-2222-4222-8222-222222222222',role:'manager'};
test('global search rejects malformed queries before reading the database',async()=>{for(const term of ['', 'a', 'a'.repeat(101),['someone'],null])await assert.rejects(()=>search({query(){throw Error('unexpected database access')}},s,term),e=>e.code==='INVALID_INPUT');assert.equal(searchTerm('  serial-42  '),'serial-42')});
test('global search parameterizes user text, escapes LIKE wildcards and scopes every entity',async()=>{
 const calls=[],db={async query(sql,params){calls.push({sql,params});return {rows:[]}}};const query="x%' OR 1=1 --_";await search(db,s,query);
 assert.equal(calls.length,4);for(const {sql,params} of calls){assert.equal(params[0],s.organizationId);assert.ok(params.includes(like(query)));assert.ok(!sql.includes(query));assert.match(sql,/LIMIT 21/)}
 for(const call of calls.slice(1)){assert.equal(call.params[1],s.branchId);assert.match(call.sql,/branch_id=\$2/)}
 assert.match(calls[1].sql,/device_serial/);assert.match(calls[2].sql,/p.imei/);assert.match(calls[3].sql,/imei/);
});
test('global search is independent of the first 100 records and reports truncation',async()=>{
 const matches=Array.from({length:21},(_,i)=>({id:'older-record-'+i}));const result=await search({query:async()=>({rows:matches})},s,'older');assert.equal(result.body.results.repairs.length,20);assert.equal(result.body.hasMore.repairs,true);assert.equal(result.body.results.repairs[0].id,'older-record-0');
});
test('dashboard totals and pipeline come from server aggregates, not bounded module lists',async()=>{
 const calls=[],db={async query(sql,params){calls.push({sql,params});return {rows:sql.includes('GROUP BY status')?[{status:'Klaar',count:147}]:sql.includes('AS sales_cents')?[{business_date:'2026-11-08',sales_cents:'123456',sale_count:151,closed_at:null}]:[]}}};
 const d=await dashboard(db,s);assert.equal(d.counts[0].count,147);assert.equal(d.trading.sale_count,151);assert.equal(d.capabilities.urgent,false);assert.equal(d.capabilities.intakeQueue,false);for(const c of calls)assert.deepEqual(c.params,[s.organizationId,s.branchId]);assert.match(calls[2].sql,/row_number\(\) OVER\(PARTITION BY status/);assert.match(calls[1].sql,/Europe\/Brussels/);assert.match(calls[3].sql,/SELECT id,action,entity_id,created_at/);assert.doesNotMatch(calls[3].sql,/detail/);
});
