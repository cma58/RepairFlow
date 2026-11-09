import management from '../../lib/management-session.js';
export default function revokeSession(req,res){return management.revokeMemberSession(req,res)}
