'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function deny(){const e=Error('ACCESS_DENIED');e.code='ACCESS_DENIED';throw e}
function requestedContext(req,env){
 const raw=req.headers?.['x-repairflow-context'];
 if(raw===undefined)return {organizationId:env.REPAIRFLOW_ORGANIZATION_ID,branchId:env.REPAIRFLOW_BRANCH_ID,dynamic:env.REPAIRFLOW_DYNAMIC_CONTEXT_ENABLED==='true'};
 if(env.REPAIRFLOW_DYNAMIC_CONTEXT_ENABLED!=='true'||typeof raw!=='string'||raw.length>100)deny();
 const parts=raw.split(':');if(parts.length!==2||!parts.every(x=>UUID.test(x)))deny();
 return {organizationId:parts[0],branchId:parts[1],dynamic:true};
}
async function authorizeContext(db,subject,context){
 if(!context.dynamic)return null;
 const result=await db.query(`SELECT m.id,m.base_role,s.id AS actor_id FROM rf_organization_memberships m
 JOIN rf_branch_memberships b ON b.organization_id=m.organization_id AND b.membership_id=m.id AND b.branch_id=$3 AND b.active
 JOIN rf_staff s ON s.organization_id=m.organization_id AND s.identity_subject=m.identity_subject AND s.active
 WHERE m.organization_id=$2 AND m.identity_subject=$1 AND m.active LIMIT 2`,[subject,context.organizationId,context.branchId]);
 if(result.rows?.length!==1||!UUID.test(result.rows[0].id)||!UUID.test(result.rows[0].actor_id)||!['owner','manager','technician','sales'].includes(result.rows[0].base_role))deny();
 const rights=(await db.query('SELECT right_code,decision FROM rf_member_rights WHERE organization_id=$1 AND branch_id=$2 AND membership_id=$3',[context.organizationId,context.branchId,result.rows[0].id])).rows;
 const overrides=Object.create(null);for(const row of rights){if(!/^[a-z]+\.[a-z]+$/.test(row.right_code)||!['allow','deny'].includes(row.decision)||Object.hasOwn(overrides,row.right_code))deny();overrides[row.right_code]=row.decision}
 return Object.freeze({id:result.rows[0].actor_id,organizationId:context.organizationId,branchId:context.branchId,role:result.rows[0].base_role,rights:Object.freeze(overrides),dynamic:true});
}
module.exports={requestedContext,authorizeContext};
