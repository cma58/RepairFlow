'use strict';
// PostgreSQL access adapter. Requires a restricted DB runtime role and reviewed RLS policies.
// Do NOT enable this adapter in production before rate limiting and DB-role review.
const SQL = `
SELECT r.reference, r.status, r.updated_at
FROM rf_customer_access a
JOIN rf_repairs r ON r.id=a.repair_id AND r.organization_id=a.organization_id
WHERE a.token_hash=$1
  AND a.revoked_at IS NULL
  AND a.expires_at > now()
LIMIT 1`;
function createRepository(query){
 if(typeof query!=='function')throw new TypeError('Database queryfunctie ontbreekt');
 return {async findActiveAccessByDigest(digest){
  if(!Buffer.isBuffer(digest)||digest.length!==32)throw new TypeError('Token digest ongeldig');
  const result=await query(SQL,[digest]);
  return result.rows[0]||null;
 }};
}
module.exports={SQL,createRepository};
