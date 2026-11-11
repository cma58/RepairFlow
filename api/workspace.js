import workspaceSession from '../lib/workspace-session.js';
import operations from '../lib/workspace-operations.js';
import testDepsModule from '../lib/test-deps.js';
export default async function handler(req,res,injected){const deps=testDepsModule.testDeps(injected);
 return workspaceSession.withWorkspace(req,res,operations.perform,deps);
}
