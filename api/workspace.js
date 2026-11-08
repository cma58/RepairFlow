import workspaceSession from '../lib/workspace-session.js';
import operations from '../lib/workspace-operations.js';
export default async function handler(req,res){
 return workspaceSession.withWorkspace(req,res,operations.perform);
}
