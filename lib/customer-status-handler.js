'use strict';
const {resolvePublicStatus}=require('./customer-status');
const MAX_BODY_BYTES=2048;
function send(res,code,payload){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Vary','Origin');
 return res.status(code).json(payload);
}
function createCustomerStatusHandler({repository,limiter,logger=()=>{}}){
 if(!repository||typeof repository.findActiveAccessByDigest!=='function')throw new TypeError('Database repository required');
 if(typeof limiter!=='function')throw new TypeError('Rate limiter required');
 return async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:'Method not allowed'});}
  if(req.headers?.['content-type']?.split(';')[0]?.trim().toLowerCase()!=='application/json')
   return send(res,415,{error:'JSON vereist'});
  const length=Number(req.headers?.['content-length']||0);
  if(!Number.isSafeInteger(length)||length<0||length>MAX_BODY_BYTES)
   return send(res,413,{error:'Ongeldige aanvraag'});
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length!==1||typeof req.body.token!=='string')
   return send(res,400,{error:'Ongeldige aanvraag'});
  // Distributed, server-side rate limiting must fail closed on infrastructure errors.
  let allowed=false;
  try{allowed=await limiter(req);}catch(e){logger('rate_limit_unavailable');return send(res,503,{error:'Tijdelijk niet beschikbaar'});}
  if(!allowed){res.setHeader('Retry-After','60');return send(res,429,{error:'Te veel pogingen. Probeer later opnieuw.'});}
  try{
   const data=await resolvePublicStatus(req.body.token,repository);
   if(!data)return send(res,404,{error:'Geen geldige toegang gevonden'});
   return send(res,200,data);
  }catch(e){logger('customer_status_unavailable');return send(res,503,{error:'Tijdelijk niet beschikbaar'});}
 };
}
module.exports={createCustomerStatusHandler,MAX_BODY_BYTES};
