import staffSession from '../staff-session.js';

const ORIGIN='https://repair-flow-theta.vercel.app';

// One staff authorization boundary: verified identity, tenant/branch mapping and
// a restricted runtime connection. The database-owner URL is never used here.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 if(req.headers?.origin&&req.headers.origin!==ORIGIN)return res.status(403).json({error:'origin_denied'});
 return staffSession(req,res);
}
