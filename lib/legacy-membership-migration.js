'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES=new Set(['owner','manager','technician','sales']);
function fail(){const error=Error('MIGRATION_CONFLICT');error.code='MIGRATION_CONFLICT';throw error}
// Caller owns the transaction and uses a reviewed migration role, never the
// web runtime. One explicit organization at a time; no email or global join.
async function migrateLegacyMemberships(db,organizationId,{apply=false,operatorSubject,reason}={}){
 if(!UUID.test(organizationId))fail();
 if(apply&&(typeof operatorSubject!=='string'||!operatorSubject.trim()||operatorSubject.length>255||typeof reason!=='string'||reason.trim().length<10))fail();
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['membership-migration:'+organizationId]);
 const staff=(await db.query('SELECT id,identity_subject,branch_id,role,active FROM rf_staff WHERE organization_id=$1 ORDER BY id FOR UPDATE',[organizationId])).rows;
 const plan=[];
 for(const actor of staff){
  if(!actor.active)continue; // Never activate old, disabled accounts.
  if(!UUID.test(actor.id)||!UUID.test(actor.branch_id)||!ROLES.has(actor.role)||typeof actor.identity_subject!=='string'||!actor.identity_subject.trim())fail();
  const branch=(await db.query('SELECT id FROM rf_branches WHERE organization_id=$1 AND id=$2',[organizationId,actor.branch_id])).rows;
  if(branch.length!==1)fail();
  const existing=(await db.query('SELECT id,base_role,active FROM rf_organization_memberships WHERE organization_id=$1 AND identity_subject=$2 FOR UPDATE',[organizationId,actor.identity_subject])).rows;
  if(existing.length>1||existing[0]&&(existing[0].base_role!==actor.role||!existing[0].active))fail();
  let member=existing[0];
  if(!member&&apply){
   member=(await db.query('INSERT INTO rf_organization_memberships(organization_id,identity_subject,base_role,active,activated_at) VALUES($1,$2,$3,true,now()) RETURNING id,base_role,active',[organizationId,actor.identity_subject,actor.role])).rows[0];
  }
  const linked=member?(await db.query('SELECT active FROM rf_branch_memberships WHERE organization_id=$1 AND membership_id=$2 AND branch_id=$3',[organizationId,member.id,actor.branch_id])).rows:[];
  if(linked.length>1||linked[0]&&!linked[0].active)fail(); // A deliberate revocation is not undone by rerun.
  if(member&&apply&&!linked.length)await db.query('INSERT INTO rf_branch_memberships(organization_id,branch_id,membership_id,active) VALUES($1,$2,$3,true)',[organizationId,actor.branch_id,member.id]);
  if(apply&&(!existing.length||!linked.length))await db.query('INSERT INTO rf_platform_audit(actor_subject,action,target_organization_id,purpose,detail) VALUES($1,$2,$3,$4,$5::jsonb)',[operatorSubject,'membership.legacy_migrated',organizationId,reason,JSON.stringify({staffId:actor.id,branchId:actor.branch_id,role:actor.role})]);
  plan.push({staffId:actor.id,branchId:actor.branch_id,role:actor.role,membership:member?'existing':'create',branchMembership:linked.length?'existing':'create'});
 }
 return Object.freeze({organizationId,applied:apply,activeStaff:plan.length,changes:plan});
}
module.exports={migrateLegacyMemberships};
