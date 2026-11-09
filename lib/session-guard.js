'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function deny(){const e=Error('ACCESS_DENIED');e.code='ACCESS_DENIED';throw e}
async function requireCurrentSession(db,identity,organizationId){
 if(!UUID.test(identity?.sessionId)||!Number.isFinite(Date.parse(identity?.createdAt))||!UUID.test(organizationId))deny();
 const r=await db.query(`SELECT 1 FROM rf_session_denials WHERE organization_id=$1 AND identity_subject=$2
 AND ((session_id=$3) OR (session_id IS NULL AND revoked_at >= $4::timestamptz)) LIMIT 1`,[organizationId,identity.subject,identity.sessionId,identity.createdAt]);
 if(r.rows.length)deny();
}
module.exports={requireCurrentSession};
