'use strict';
// Branch-scoped operational allowlist until invitations are backed by memberships.
function invited(email,env=process.env){
 if(typeof email!=='string'||!email.trim()||email.length>254)return false;
 const raw=env.REPAIRFLOW_LOGIN_INVITED_EMAILS;
 if(typeof raw!=='string'||raw.length>5000)return false;
 return raw.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}
module.exports={invited};
