'use strict';
// Fail-closed placeholder: no shared database or customer authorization exists yet.
// Do not replace with browser localStorage, ticket-number lookups, or client-supplied status.
module.exports = function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'})}
 return res.status(503).json({error:'Klantenzone nog niet geactiveerd'});
};