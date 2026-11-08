'use strict';
// All reads run inside withWorkspace's verified staff transaction and RLS scope.
const REPAIR_SELECT=`SELECT r.id,r.customer_id,r.reference,r.device_brand,r.device_model,r.device_serial,r.complaint,r.status,r.charge_cents,r.quote_approved_at,r.created_at,
 coalesce((SELECT sum(l.line_total_cents) FROM rf_sale_lines l JOIN rf_sales v ON v.organization_id=l.organization_id AND v.id=l.sale_id WHERE l.organization_id=r.organization_id AND l.repair_id=r.id AND v.status='completed'),0) AS paid_cents FROM rf_repairs r`;
function invalid(){const error=Error('INVALID_INPUT');error.code='INVALID_INPUT';throw error}
function searchTerm(value){if(typeof value!=='string')invalid();const term=value.trim();if(term.length<2||term.length>100)invalid();return term}
function like(value){return '%'+value.replace(/[\\%_]/g,'\\$&')+'%'}
async function search(db,s,value){
 const term=searchTerm(value),pattern=like(term),o=s.organizationId,b=s.branchId;
 const definitions=[
  ['customers',`SELECT id,display_name,email,phone,customer_type,company_name,vat_number,billing_address,created_at FROM rf_customers WHERE organization_id=$1 AND concat_ws(' ',display_name,company_name,email,phone,vat_number) ILIKE $2 ORDER BY lower(display_name)=lower($3) DESC,created_at DESC,id LIMIT 21`,[o,pattern,term]],
  ['repairs',`${REPAIR_SELECT} WHERE r.organization_id=$1 AND r.branch_id=$2 AND concat_ws(' ',r.reference,r.device_serial,r.device_brand,r.device_model) ILIKE $3 ORDER BY (lower(r.reference)=lower($4) OR lower(r.device_serial)=lower($4)) DESC,r.created_at DESC,r.id LIMIT 21`,[o,b,pattern,term]],
  ['products',`SELECT p.id,p.sku,p.name,p.kind,p.imei,p.unit_price_cents,p.active,coalesce(q.quantity,0) AS quantity,
   coalesce(q.quantity,0)-coalesce((SELECT sum(h.quantity) FROM rf_part_reservations h WHERE h.organization_id=p.organization_id AND h.branch_id=$2 AND h.product_id=p.id AND h.status='reserved'),0) AS available
   FROM rf_products p LEFT JOIN rf_stock_balances q ON q.organization_id=p.organization_id AND q.branch_id=$2 AND q.product_id=p.id WHERE p.organization_id=$1 AND concat_ws(' ',p.sku,p.name,p.imei) ILIKE $3 ORDER BY (lower(p.sku)=lower($4) OR lower(p.imei)=lower($4)) DESC,p.created_at DESC,p.id LIMIT 21`,[o,b,pattern,term]],
  ['refurbished',`SELECT id,imei,description,price_cents,status,created_at FROM rf_refurbished WHERE organization_id=$1 AND branch_id=$2 AND concat_ws(' ',imei,description) ILIKE $3 ORDER BY lower(imei)=lower($4) DESC,created_at DESC,id LIMIT 21`,[o,b,pattern,term]]
 ];
 const results={},hasMore={};for(const [key,sql,params] of definitions){const {rows}=await db.query(sql,params);results[key]=rows.slice(0,20);hasMore[key]=rows.length>20}
 return {body:{results,hasMore,query:term,capabilities:{repairImei:false,refurbishedSerial:false}}};
}
async function dashboard(db,s){
 const params=[s.organizationId,s.branchId];
 const counts=(await db.query('SELECT status,count(*)::integer AS count FROM rf_repairs WHERE organization_id=$1 AND branch_id=$2 GROUP BY status',params)).rows;
 const trading=(await db.query(`SELECT (now() AT TIME ZONE 'Europe/Brussels')::date::text AS business_date,
 (SELECT name FROM rf_branches WHERE organization_id=$1 AND id=$2) AS branch_name,
 (SELECT coalesce(sum(total_cents),0)::text FROM rf_sales WHERE organization_id=$1 AND branch_id=$2 AND status='completed' AND (sold_at AT TIME ZONE 'Europe/Brussels')::date=(now() AT TIME ZONE 'Europe/Brussels')::date) AS sales_cents,
 (SELECT count(*)::integer FROM rf_sales WHERE organization_id=$1 AND branch_id=$2 AND status='completed' AND (sold_at AT TIME ZONE 'Europe/Brussels')::date=(now() AT TIME ZONE 'Europe/Brussels')::date) AS sale_count,
 (SELECT closed_at FROM rf_cash_days WHERE organization_id=$1 AND branch_id=$2 AND business_date=(now() AT TIME ZONE 'Europe/Brussels')::date) AS closed_at`,params)).rows[0];
 const pipeline=(await db.query(`${REPAIR_SELECT} WHERE r.organization_id=$1 AND r.branch_id=$2 AND r.id IN
 (SELECT id FROM (SELECT id,row_number() OVER(PARTITION BY status ORDER BY created_at,id) AS rank FROM rf_repairs WHERE organization_id=$1 AND branch_id=$2 AND status NOT IN ('Afgehaald','Geannuleerd')) ranked WHERE rank<=3) ORDER BY r.created_at,r.id`,params)).rows;
 const activities=(await db.query('SELECT id,action,entity_id,created_at FROM rf_activity WHERE organization_id=$1 AND branch_id=$2 ORDER BY created_at DESC,id LIMIT 20',params)).rows;
 return {counts,trading,pipeline,activities,capabilities:{urgent:false,intakeQueue:false,minimumStock:false}};
}
module.exports={search,dashboard,searchTerm,like,REPAIR_SELECT};
