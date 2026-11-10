import webauthn from '../lib/webauthn-handler.js';
import management from '../lib/management-session.js';
import invitations from '../lib/member-invitations.js';
import credentials from '../lib/credential-management.js';
import testDepsModule from '../lib/test-deps.js';
// One Vercel function keeps the existing Hobby preview within its function cap.
// Each action still has its own server-side authorization boundary.
// deps is only supplied by isolated tests; Vercel invokes handler(req,res).
export default function handler(req,res,injected){const deps=testDepsModule.testDeps(injected);
 const action=req.body?.action;
 if(['registrationOptions','registrationVerify','authenticationOptions','authenticationVerify'].includes(action))return webauthn.webauthnHandler(req,res,deps);
 if(['issue','accept','revoke'].includes(action))return invitations.memberInvitations(req,res,deps);
 if(action==='revokeSession')return management.revokeMemberSession(req,res,deps);
 if(credentials.ACTIONS.includes(action))return credentials.credentialManagement(req,res,deps);
 res.setHeader('Cache-Control','no-store, private');return res.status(req.method==='POST'?400:405).json({error:'invalid_action'});
}
