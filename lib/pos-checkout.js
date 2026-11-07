'use strict';
// Server-only POS checkout service. Requires authenticated, authorized tenant/branch
// context, a database client with BEGIN/COMMIT/ROLLBACK, and reviewed RLS policies.
// Not connected to the browser or public API.
const crypto=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(code)=>{const e=new Error(code);e.code=code;return e};
function validateCheckout(request){
 if(!request||!UUID.test(request.organizationId)||!UUID.test(request.branchId)||
    !UUID.test(request.actorId)||!UUID.test(request.requestId))throw fail('INVALID_CONTEXT');
 if(!Array.isArray(request.lines)||!request.lines.length||request.lines.length>100)throw fail('INVALID_LINES');
 const ids=new Set();
 for(const l of request.lines){
  if(!l||!UUID.test(l.productId)||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>999||
    ids.has(l.productId))throw fail('INVALID_LINES');
  ids.add(l.productId);
 }
 if(!['cash','card','transfer','other'].includes(request.paymentMethod))throw fail('INVALID_PAYMENT_METHOD');
 return request;
}
async function checkout(client,request){
 validateCheckout(request);
 if(!client||typeof client.query!=='function')throw fail('INVALID_DB_CLIENT');
 const {organizationId:org,branchId:branch,actorId:actor,requestId,lines,paymentMethod}=request;
 await client.query('BEGIN');
 try{
  // A unique request key is stored with the sale. Concurrent identical requests
  // serialize on the advisory transaction lock, then return the existing sale.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[org+':'+requestId]);
  const previous=await client.query(
   'SELECT id,reference,total_cents FROM rf_sales WHERE organization_id=$1 AND request_id=$2',
   [org,requestId]);
  if(previous.rows.length){
   await client.query('COMMIT');
   return {id:previous.rows[0].id,reference:previous.rows[0].reference,
    totalCents:Number(previous.rows[0].total_cents),replayed:true};
  }
  const ordered=[...lines].sort((a,b)=>a.productId.localeCompare(b.productId));
  const stock=new Map();
  let total=0;
  for(const line of ordered){
   const r=await client.query(
    `SELECT p.id,p.name,p.sku,p.unit_price_cents,p.active,b.quantity
       FROM rf_products p JOIN rf_stock_balances b
         ON b.organization_id=p.organization_id AND b.product_id=p.id
      WHERE p.organization_id=$1 AND b.branch_id=$2 AND p.id=$3
      FOR UPDATE OF b`,[org,branch,line.productId]);
   const p=r.rows[0];
   if(!p||!p.active||Number(p.quantity)<line.quantity)throw fail('INSUFFICIENT_STOCK');
   const cents=Number(p.unit_price_cents);
   if(!Number.isSafeInteger(cents)||cents<0||!Number.isSafeInteger(cents*line.quantity))throw fail('INVALID_PRICE');
   const amount=cents*line.quantity;
   total+=amount;if(!Number.isSafeInteger(total)||total>Number.MAX_SAFE_INTEGER)throw fail('INVALID_TOTAL');
   stock.set(line.productId,{...p,amount});
  }
  if(total<=0)throw fail('INVALID_TOTAL');
  const reference='KAS-'+crypto.randomUUID();
  const inserted=await client.query(
   `INSERT INTO rf_sales(organization_id,branch_id,reference,request_id,subtotal_cents,total_cents,recorded_by)
     VALUES($1,$2,$3,$4,$5,$5,$6) RETURNING id`,
   [org,branch,reference,requestId,total,actor]);
  const saleId=inserted.rows[0].id;
  for(const line of ordered){
   const p=stock.get(line.productId);
   await client.query(
    `INSERT INTO rf_sale_lines(organization_id,sale_id,product_id,description,sku_snapshot,quantity,unit_price_cents,line_total_cents)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [org,saleId,line.productId,p.name,p.sku,line.quantity,Number(p.unit_price_cents),p.amount]);
   const changed=await client.query(
    `UPDATE rf_stock_balances SET quantity=quantity-$4,updated_at=now()
      WHERE organization_id=$1 AND branch_id=$2 AND product_id=$3 AND quantity >= $4`,
    [org,branch,line.productId,line.quantity]);
   if(changed.rowCount!==1)throw fail('INSUFFICIENT_STOCK');
   await client.query(
    `INSERT INTO rf_stock_movements(organization_id,branch_id,product_id,sale_id,quantity_delta,reason,recorded_by)
      VALUES($1,$2,$3,$4,$5,'sale',$6)`,
    [org,branch,line.productId,saleId,-line.quantity,actor]);
  }
  // Recorded != provider-confirmed. This is administrative only.
  await client.query(
   `INSERT INTO rf_sale_payments(organization_id,sale_id,amount_cents,method,payment_state)
      VALUES($1,$2,$3,$4,'recorded')`,[org,saleId,total,paymentMethod]);
  await client.query('COMMIT');
  return {id:saleId,reference,totalCents:total,replayed:false};
 }catch(error){
  try{await client.query('ROLLBACK')}catch{}
  throw error;
 }
}
module.exports={checkout,validateCheckout};
