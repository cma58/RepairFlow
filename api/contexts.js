import discovery from '../lib/context-discovery.js';
import testDepsModule from '../lib/test-deps.js';
export default function handler(req,res,injected){const deps=testDepsModule.testDeps(injected);return discovery.contextDiscovery(req,res,deps)}
