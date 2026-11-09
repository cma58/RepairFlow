'use strict';
// Administrative preparation only. This never activates an account or returns a credential.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(){const e=Error('INVALID_BOOTSTRAP');e.code='INVALID_BOOTSTRAP';throw e}
async function prepareInactiveOwner(db,{verifiedSubject,reviewReference}={}){
 if(typeof verifiedSubject!=='string'||!UUID.test(verifiedSubject)||typeof reviewReference!=='string'||reviewReference.trim().length<10||reviewReference.length>200)invalid();
 // Caller must hold a DB admin transaction and document identity verification.
 const existing=await db.query('SELECT identity_subject,active FROM rf_platform_owners FOR UPDATE');
 if(existing.rows.length)invalid();
 const row=await db.query('INSERT INTO rf_platform_owners(identity_subject,active) VALUES($1,false) RETURNING identity_subject,active',[verifiedSubject]);
 await db.query('INSERT INTO rf_platform_audit(actor_subject,action,purpose,detail) VALUES($1,$2,$3,$4::jsonb)',[verifiedSubject,'platform_owner.prepared',reviewReference.trim(),JSON.stringify({active:false})]);
 return Object.freeze({identitySubject:row.rows[0].identity_subject,active:false});
}
module.exports={prepareInactiveOwner};
