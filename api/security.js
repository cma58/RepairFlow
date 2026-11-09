import webauthn from '../lib/webauthn-handler.js';
import management from '../lib/management-session.js';
import invitations from '../lib/member-invitations.js';
// One Vercel function keeps the existing Hobby preview within its function cap.
// Each action still has its own server-side authorization boundary.
export default function handler(req,res){
 const action=req.body?.action;
 if(['registrationOptions','registrationVerify','authenticationOptions','authenticationVerify'].includes(action))return webauthn.webauthnHandler(req,res);
 if(['issue','accept','revoke'].includes(action))return invitations.memberInvitations(req,res);
 if(action==='revokeSession')return management.revokeMemberSession(req,res);
 res.setHeader('Cache-Control','no-store, private');return res.status(req.method==='POST'?400:405).json({error:'invalid_action'});
}
