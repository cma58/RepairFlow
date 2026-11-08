'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {analyzeBackup}=require('../lib/legacy-import-preflight');
const source={format:'RepairFlow-browser-backup',version:1,keys:{rf07v3:'{"R1":{"id":"R1"}}',rfInventoryV3:'{}',rfCustomersV1:'{"C1":{"id":"C1"}}',rfRefurbV1:'[]',rfPosProductsV1:'[]',rfPosSalesV1:'[]',rfPosStockMovementsV1:'[]'}};
test('read-only preflight counts without declaring import approval',()=>{const input=JSON.stringify(source),r=analyzeBackup(input);assert.equal(r.errors.length,0);assert.equal(r.counts.rf07v3,1);assert.equal(r.readyForImport,false);assert.match(r.sha256,/^[a-f0-9]{64}$/)});
test('corrupt data and duplicate IMEI block a dry-run',()=>{const x=structuredClone(source);x.keys.rf07v3='{';x.keys.rfRefurbV1=JSON.stringify([{id:'A',imei:'12 34'},{id:'B',imei:'1234'}]);const r=analyzeBackup(JSON.stringify(x));assert.ok(r.errors.some(e=>e.includes('rf07v3 bevat onleesbare JSON')));assert.ok(r.errors.some(e=>e.includes('dubbele imei')))});
test('repair-only export warns that customer and sale history is absent',()=>{const r=analyzeBackup(JSON.stringify({format:'repairflow-local-backup',version:1,repairs:{R1:{}},inventory:{}}));assert.equal(r.counts.rf07v3,1);assert.ok(r.warnings.some(w=>w.includes('volledige browserexport')));assert.equal(r.readyForImport,false)});
