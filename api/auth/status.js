// Public authentication readiness endpoint. No database access or user information.
// Do not interpret a magic-link redirect as proof of a valid server-side session.
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 return res.status(200).json({
  service:'RepairFlow',
  authentication:{emailDelivery:'configured',sessionValidation:'not_implemented',authorization:'disabled'},
  canAccessCustomerData:false,
  message:'Login via e-mail is nog niet gekoppeld aan een gecontroleerde RepairFlow-sessie.'
 });
}
