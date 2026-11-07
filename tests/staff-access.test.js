'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveStaff,requireRole}=require('../lib/staff-access');
const org='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const row={id:'44444444-4444-4444-8444-444444444444',organization_id:org,branch_id:branch,role:'sales'};
const lookup=async(_sql,args)=>{assert.deepEqual(args,['verified-neon-subject',org]);return {rows:[row]}};
test('verified staff gets branch-scoped access',async()=>{
 const staff=await resolveStaff({verifiedSubject:'verified-neon-subject',organizationId:org,branchId:branch,query:lookup});
 assert.equal(staff.role,'sales');assert.equal(staff.branchId,branch);assert.ok(Object.isFrozen(staff));
});
test('cross-branch access rejected',async()=>{
 await assert.rejects(resolveStaff({verifiedSubject:'verified-neon-subject',organizationId:org,branchId:other,query:async()=>({rows:[row]})}),/ACCESS_DENIED/);
});
test('cross-tenant access rejected',async()=>{
 await assert.rejects(resolveStaff({verifiedSubject:'verified-neon-subject',organizationId:org,branchId:branch,query:async()=>({rows:[{...row,organization_id:other}]})}),/ACCESS_DENIED/);
});
test('unknown identity and invalid subject rejected',async()=>{
 await assert.rejects(resolveStaff({verifiedSubject:'verified-neon-subject',organizationId:org,branchId:branch,query:async()=>({rows:[]})}),/ACCESS_DENIED/);
 await assert.rejects(resolveStaff({verifiedSubject:'',organizationId:org,branchId:branch,query:lookup}),/ACCESS_DENIED/);
});
test('sales cannot assume owner role',()=>{
 assert.throws(()=>requireRole({role:'sales'},['owner','manager']),/ACCESS_DENIED/);
 assert.equal(requireRole({role:'sales'},['sales']).role,'sales');
});
