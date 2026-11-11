import staffSession from '../staff-session.js';
import sessionTools from '../../lib/neon-auth-session.js';
import testDepsModule from '../../lib/test-deps.js';

// One staff authorization boundary: verified identity, tenant/branch mapping and
// a restricted runtime connection. The database-owner URL is never used here.
export default async function handler(req,res,injected){const deps=testDepsModule.testDeps(injected);
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 if(req.headers?.origin){
  let origin;try{origin=sessionTools.appOrigin(deps?.env);}catch{return res.status(503).json({error:'Medewerkersportaal nog niet geactiveerd'});}
  if(req.headers.origin!==origin)return res.status(403).json({error:'origin_denied'});
 }
 return staffSession(req,res,deps);
}
