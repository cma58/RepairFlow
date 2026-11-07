'use strict';
const crypto = require('node:crypto');
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const PUBLIC_STATUSES = new Map([
 ['Binnengebracht','Binnengebracht'],['Diagnose','Diagnose'],
 ['Wachten op klant','Wachten op akkoord'],['Wachten op onderdeel','Wachten op onderdeel'],
 ['In reparatie','In reparatie'],['Kwaliteitscontrole','Kwaliteitscontrole'],
 ['Klaar','Klaar voor afhaling'],['Afgehaald','Afgehaald'],['Geannuleerd','Geannuleerd']
]);
function generateAccessToken(){return crypto.randomBytes(32).toString('base64url')}
function hashToken(token){if(!TOKEN_PATTERN.test(token))throw new TypeError('Ongeldige toegangscode');return crypto.createHash('sha256').update(token,'utf8').digest()}
function publicStatus(row){
 if(!row||!PUBLIC_STATUSES.has(row.status))throw new Error('Onbekende reparatiestatus');
 return Object.freeze({
  reference:String(row.reference),
  status:PUBLIC_STATUSES.get(row.status),
  updatedAt:new Date(row.updated_at).toISOString(),
  nextStep: row.status==='Klaar'?'Je toestel kan worden afgehaald.':row.status==='Afgehaald'?'Je herstelling is afgerond.':'We houden je op de hoogte.'
 });
}
// DB adapter is injected to keep authorization and projection testable.
// Query MUST check token digest, expiry and revocation in a single SQL statement.
// No internal location, repairer, customer contact, IMEI or private notes may be returned.
async function resolvePublicStatus(token,repository){
 if(typeof token!=='string'||!TOKEN_PATTERN.test(token))return null;
 const row=await repository.findActiveAccessByDigest(hashToken(token));
 return row?publicStatus(row):null;
}
module.exports={TOKEN_PATTERN,generateAccessToken,hashToken,publicStatus,resolvePublicStatus};
