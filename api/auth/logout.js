import authLogout from '../../lib/auth-logout.js';
import testDepsModule from '../../lib/test-deps.js';
export default function handler(req,res,injected){const deps=testDepsModule.testDeps(injected);return authLogout.logout(req,res,deps)}
