'use strict';
// Staff authorization boundary. The subject comes ONLY from a verified Neon Auth
// session/JWT, never from request body, query string, or user-provided headers.
const VALID_ROLES=new Set(['owner','manager','technician','sales']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_SQL=`SELECT s.id,s.organization_id,s.branch_id,s.role
FROM rf_staff s WHERE s.identity_subject=$1 AND s.organization_id=$2 AND s.active=true
LIMIT 1`;
function deny(){const error=new Error('ACCESS_DENIED');error.code='ACCESS_DENIED';return error;}
async function resolveStaff({verifiedSubject,organizationId,branchId,query}){
 if(typeof verifiedSubject!=='string'||!verifiedSubject.trim()||verifiedSubject.length>255||
    !UUID.test(organizationId)||!UUID.test(branchId)||typeof query!=='function')throw deny();
 const result=await query(STAFF_SQL,[verifiedSubject,organizationId]);
 const staff=result?.rows?.[0];
 if(!staff||!UUID.test(staff.id)||!VALID_ROLES.has(staff.role)||staff.organization_id!==organizationId||
    (staff.branch_id!==null&&staff.branch_id!==branchId))throw deny();
 return Object.freeze({id:staff.id,organizationId,branchId,role:staff.role});
}
function requireRole(staff,roles){
 if(!staff||!Array.isArray(roles)||!roles.includes(staff.role))throw deny();
 return staff;
}
module.exports={resolveStaff,requireRole,STAFF_SQL};
