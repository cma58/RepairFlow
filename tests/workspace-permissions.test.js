'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {RIGHTS,BY_ROLE,requirePermission}=require('../lib/workspace-permissions');
test('eleven explicit rights have distinct names and roles never inherit manager administration',()=>{
 assert.equal(Object.keys(RIGHTS).length,11);assert.equal(new Set(Object.values(RIGHTS)).size,11);
 assert.equal(BY_ROLE.owner.length,11);assert.ok(!BY_ROLE.manager.includes(RIGHTS.employees));
 assert.ok(!BY_ROLE.manager.includes(RIGHTS.settings));assert.ok(!BY_ROLE.manager.includes(RIGHTS.refunds));
});
test('dynamic actors cannot forge permissions or access financial list with operational roles',()=>{
 for(const role of ['manager','technician','sales']){
  const staff={role,dynamic:true,permissions:['settings.manage','refunds.approve']};
  assert.throws(()=>requirePermission(staff,{method:'POST',body:{action:'correction'}}),{code:'ACCESS_DENIED'});
  assert.throws(()=>requirePermission(staff,{method:'POST',body:{action:'unexpected'}}),{code:'ACCESS_DENIED'});
 }
 for(const role of ['technician','sales'])assert.throws(()=>requirePermission({role,dynamic:true},{method:'GET'}),{code:'ACCESS_DENIED'});
 assert.doesNotThrow(()=>requirePermission({role:'manager',dynamic:true},{method:'GET'}));
 assert.doesNotThrow(()=>requirePermission({role:'owner',dynamic:true},{method:'POST',body:{action:'correction'}}));
 assert.throws(()=>requirePermission({role:'owner',dynamic:true,rights:{'settings.manage':'deny'}},{method:'POST',body:{action:'correction'}}),{code:'ACCESS_DENIED'});
 assert.doesNotThrow(()=>requirePermission({role:'sales',dynamic:true,rights:{'financial.read':'allow'}},{method:'GET'}));
});
