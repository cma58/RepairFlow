'use strict';
const crypto=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses=['Binnengebracht','Diagnose','Wachten op klant','Wachten op onderdeel','In reparatie','Kwaliteitscontrole','Klaar','Afgehaald','Geannuleerd'];
const transitions={Binnengebracht:['Diagnose','Geannuleerd'],Diagnose:['Wachten op klant','Wachten op onderdeel','In reparatie','Geannuleerd'],'Wachten op klant':['Wachten op onderdeel','In reparatie','Geannuleerd'],'Wachten op onderdeel':['In reparatie','Geannuleerd'],'In reparatie':['Kwaliteitscontrole','Wachten op onderdeel'],Kwaliteitscontrole:['In reparatie','Klaar'],Klaar:['Afgehaald']};
function fail(code){const e=Error(code);e.code=code;throw e}
function uuid(value){if(typeof value!=='string'||!UUID.test(value))fail('INVALID_INPUT');return value}
function label(value,max=200){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('INVALID_INPUT');return value.trim()}
function optional(value,max=255){if(value==null||value==='')return null;if(typeof value!=='string'||value.length>max)fail('INVALID_INPUT');return value.trim()}
function cents(value){if(!Number.isSafeInteger(value)||value<0||value>1e12)fail('INVALID_INPUT');return value}
function quantity(value){if(!Number.isSafeInteger(value)||value<1||value>999)fail('INVALID_INPUT');return value}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}
function dayKey(date){return date instanceof Date?date.toISOString().slice(0,10):String(date).slice(0,10)}
async function audit(db,staff,action,entityId,detail={}){
 await db.query('INSERT INTO rf_activity(organization_id,branch_id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[staff.organizationId,staff.branchId,staff.id,action,entityId,JSON.stringify(detail)]);
}
async function list(db,s){
 const o=s.organizationId,b=s.branchId;
 const queries=[
  ['customers','SELECT id,display_name,email,phone,customer_type,company_name,vat_number,billing_address,created_at FROM rf_customers WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100',[o]],
  ['repairs','SELECT id,customer_id,reference,device_brand,device_model,device_serial,complaint,status,charge_cents,created_at FROM rf_repairs WHERE organization_id=$1 AND branch_id=$2 ORDER BY created_at DESC LIMIT 100',[o,b]],
  ['products','SELECT p.id,p.sku,p.name,p.kind,p.unit_price_cents,p.active,coalesce(q.quantity,0) AS quantity FROM rf_products p LEFT JOIN rf_stock_balances q ON q.organization_id=p.organization_id AND q.branch_id=$2 AND q.product_id=p.id WHERE p.organization_id=$1 ORDER BY p.created_at DESC LIMIT 100',[o,b]],
  ['refurbished','SELECT id,imei,description,price_cents,status,created_at FROM rf_refurbished WHERE organization_id=$1 AND branch_id=$2 ORDER BY created_at DESC LIMIT 100',[o,b]],
  ['sales','SELECT id,reference,total_cents,sold_at FROM rf_sales WHERE organization_id=$1 AND branch_id=$2 ORDER BY sold_at DESC LIMIT 100',[o,b]],
  ['cashDays',`SELECT d.id,d.business_date,d.total_cents,d.closed_at,
    coalesce((SELECT sum(c.delta_cents) FROM rf_cash_corrections c WHERE c.organization_id=d.organization_id AND c.branch_id=d.branch_id AND c.day_id=d.id),0) AS corrections_cents
    FROM rf_cash_days d WHERE d.organization_id=$1 AND d.branch_id=$2 ORDER BY d.business_date DESC LIMIT 30`,[o,b]],
  ['cashDayPayments',`SELECT (v.sold_at AT TIME ZONE 'Europe/Brussels')::date AS business_date,p.method,sum(p.amount_cents) AS amount_cents
    FROM rf_sales v JOIN rf_sale_payments p ON p.organization_id=v.organization_id AND p.sale_id=v.id
    WHERE v.organization_id=$1 AND v.branch_id=$2 AND v.status='completed'
    GROUP BY 1,2 ORDER BY 1 DESC`,[o,b]]
 ];
 const out={};for(const [key,sql,params] of queries)out[key]=(await db.query(sql,params)).rows;
 return {body:out};
}
async function customer(db,s,x){
 const requestId=uuid(x.requestId),name=label(x.name),email=optional(x.email),phone=optional(x.phone,60),type=x.type||'individual';
 if(!['individual','business'].includes(type))fail('INVALID_INPUT');
 const company=type==='business'?label(x.company,200):null,vat=type==='business'?optional(x.vat,40):null,address=type==='business'?label(x.billingAddress,500):null;
 const r=await db.query(`INSERT INTO rf_customers(organization_id,request_id,display_name,email,phone,customer_type,company_name,vat_number,billing_address) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id,display_name,email,phone,customer_type,company_name,vat_number,billing_address`,[s.organizationId,requestId,name,email,phone,type,company,vat,address]);
 const row=r.rows[0]||(await db.query('SELECT id,display_name,email,phone,customer_type,company_name,vat_number,billing_address FROM rf_customers WHERE organization_id=$1 AND request_id=$2',[s.organizationId,requestId])).rows[0];
 if(!row||row.display_name!==name||row.email!==email||row.phone!==phone||row.customer_type!==type||row.company_name!==company||row.vat_number!==vat||row.billing_address!==address)fail('CONFLICT');
 if(r.rows.length)await audit(db,s,'customer.created',row.id);
 return {status:r.rows.length?201:200,body:{customer:row,replayed:!r.rows.length}};
}
async function repair(db,s,x){
 const requestId=uuid(x.requestId),customerId=uuid(x.customerId),brand=label(x.brand,100),model=optional(x.model,100),serial=optional(x.serial,100),complaint=label(x.complaint,1000),charge=cents(x.chargeCents);
 const c=await db.query('SELECT id FROM rf_customers WHERE organization_id=$1 AND id=$2',[s.organizationId,customerId]);if(c.rows.length!==1)fail('NOT_FOUND');
 const reference='REP-'+requestId;
 const r=await db.query(`INSERT INTO rf_repairs(organization_id,branch_id,request_id,customer_id,reference,device_brand,device_model,device_serial,complaint,charge_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id,customer_id,reference,device_brand,device_model,device_serial,complaint,charge_cents,status`,[s.organizationId,s.branchId,requestId,customerId,reference,brand,model,serial,complaint,charge]);
 const row=r.rows[0]||(await db.query('SELECT id,customer_id,reference,device_brand,device_model,device_serial,complaint,charge_cents,status FROM rf_repairs WHERE organization_id=$1 AND request_id=$2',[s.organizationId,requestId])).rows[0];
 if(!row||row.customer_id!==customerId||row.device_brand!==brand||row.device_model!==model||row.device_serial!==serial||row.complaint!==complaint||Number(row.charge_cents)!==charge)fail('CONFLICT');
 if(r.rows.length)await audit(db,s,'repair.created',row.id);
 return {status:r.rows.length?201:200,body:{repair:row,replayed:!r.rows.length}};
}
async function changeRepair(db,s,x){
 const id=uuid(x.repairId),expected=label(x.expectedStatus,60),next=label(x.status,60);
 if(!statuses.includes(expected)||!transitions[expected]?.includes(next))fail('INVALID_INPUT');
 const r=await db.query('SELECT id,status,charge_cents FROM rf_repairs WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',[s.organizationId,s.branchId,id]);
 const row=r.rows[0];if(!row)fail('NOT_FOUND');if(row.status!==expected)fail('CONFLICT');
 if(next==='Afgehaald'&&Number(row.charge_cents)>0){
  const paid=await db.query(`SELECT coalesce(sum(l.line_total_cents),0) AS amount FROM rf_sale_lines l JOIN rf_sales v ON v.id=l.sale_id AND v.organization_id=l.organization_id WHERE l.organization_id=$1 AND l.repair_id=$2 AND v.status='completed'`,[s.organizationId,id]);
  if(Number(paid.rows[0].amount)!==Number(row.charge_cents))fail('CONFLICT');
 }
 await db.query('UPDATE rf_repairs SET status=$4,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3',[s.organizationId,s.branchId,id,next]);
 await db.query('INSERT INTO rf_repair_status_events(organization_id,repair_id,from_status,to_status,changed_by) VALUES($1,$2,$3,$4,$5)',[s.organizationId,id,expected,next,s.id]);
 await audit(db,s,'repair.status',id,{from:expected,to:next});
 return {body:{id,status:next}};
}
async function product(db,s,x){
 const requestId=uuid(x.requestId),sku=label(x.sku,80),name=label(x.name),kind=label(x.kind,20),price=cents(x.priceCents);
 if(!['accessory','device','part','service','other'].includes(kind))fail('INVALID_INPUT');
 const r=await db.query(`INSERT INTO rf_products(organization_id,request_id,sku,name,kind,unit_price_cents) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id,sku,name,kind,unit_price_cents`,[s.organizationId,requestId,sku,name,kind,price]);
 const row=r.rows[0]||(await db.query('SELECT id,sku,name,kind,unit_price_cents FROM rf_products WHERE organization_id=$1 AND request_id=$2',[s.organizationId,requestId])).rows[0];
 if(!row||row.sku!==sku||row.name!==name||row.kind!==kind||Number(row.unit_price_cents)!==price)fail('CONFLICT');
 if(r.rows.length)await audit(db,s,'product.created',row.id);
 return {status:r.rows.length?201:200,body:{product:row,replayed:!r.rows.length}};
}
async function stock(db,s,x){
 const requestId=uuid(x.requestId),productId=uuid(x.productId),qty=quantity(x.quantity),repairId=x.repairId?uuid(x.repairId):null;
 if(!['receive','consume'].includes(x.operation)||x.operation==='receive'&&repairId||x.operation==='consume'&&!repairId)fail('INVALID_INPUT');
 const o=s.organizationId,b=s.branchId,delta=x.operation==='receive'?qty:-qty;
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[o+':movement:'+requestId]);
 const old=await db.query('SELECT product_id,repair_id,quantity_delta FROM rf_stock_movements WHERE organization_id=$1 AND request_id=$2',[o,requestId]);
 if(old.rows.length){const prior=old.rows[0];if(prior.product_id!==productId||prior.repair_id!==repairId||prior.quantity_delta!==delta)fail('CONFLICT');return {body:{replayed:true}}}
 if(repairId){const r=await db.query('SELECT status FROM rf_repairs WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',[o,b,repairId]);if(!r.rows.length||!['In reparatie','Kwaliteitscontrole'].includes(r.rows[0].status))fail('CONFLICT')}
 const p=await db.query('SELECT id FROM rf_products WHERE organization_id=$1 AND id=$2 AND active=true',[o,productId]);if(!p.rows.length)fail('NOT_FOUND');
 await db.query('INSERT INTO rf_stock_balances(organization_id,branch_id,product_id,quantity) VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING',[o,b,productId]);
 const changed=await db.query('UPDATE rf_stock_balances SET quantity=quantity+$4,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND product_id=$3 AND quantity+$4>=0 RETURNING quantity',[o,b,productId,delta]);
 if(!changed.rows.length)fail('INSUFFICIENT_STOCK');
 await db.query('INSERT INTO rf_stock_movements(organization_id,branch_id,product_id,repair_id,request_id,quantity_delta,reason,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[o,b,productId,repairId,requestId,delta,repairId?'adjustment':'purchase',s.id]);
 await audit(db,s,repairId?'repair.part_consumed':'stock.received',productId,{quantityDelta:delta,repairId});
 return {status:201,body:{quantity:changed.rows[0].quantity,replayed:false}};
}
async function refurb(db,s,x){
 const requestId=uuid(x.requestId),imei=label(x.imei,32),description=label(x.description),price=cents(x.priceCents);
 if(!/^[0-9]{15}$/.test(imei))fail('INVALID_INPUT');
 const sum=[...imei].slice(0,14).reduce((n,d,i)=>{const v=Number(d)*(i%2===1?2:1);return n+Math.floor(v/10)+v%10},0);
 if((10-sum%10)%10!==Number(imei[14]))fail('INVALID_INPUT');
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[s.organizationId+':imei:'+imei]);
 const linked=await db.query("SELECT id FROM rf_products WHERE organization_id=$1 AND regexp_replace(upper(imei),'[^A-Z0-9]','','g')=$2 LIMIT 1",[s.organizationId,imei]);
 if(linked.rows.length)fail('CONFLICT');
 const r=await db.query(`INSERT INTO rf_refurbished(organization_id,branch_id,request_id,imei,description,price_cents) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id,imei,description,price_cents,status`,[s.organizationId,s.branchId,requestId,imei,description,price]);
 const row=r.rows[0]||(await db.query('SELECT id,imei,description,price_cents,status FROM rf_refurbished WHERE organization_id=$1 AND branch_id=$2 AND request_id=$3',[s.organizationId,s.branchId,requestId])).rows[0];
 if(!row||row.imei!==imei||row.description!==description||Number(row.price_cents)!==price)fail('CONFLICT');
 if(r.rows.length)await audit(db,s,'refurb.registered',row.id);
 return {status:r.rows.length?201:200,body:{refurbished:row,replayed:!r.rows.length}};
}
async function assess(db,s,x){
 const id=uuid(x.refurbishedId),expected=label(x.expectedStatus,20),next=label(x.status,20),reason=label(x.reason,500);
 if(!['inspection','rejected','available'].includes(expected)||!['rejected','available'].includes(next)||next===expected)fail('INVALID_INPUT');
 const r=await db.query('UPDATE rf_refurbished SET status=$4,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3 AND status=$5 RETURNING id',[s.organizationId,s.branchId,id,next,expected]);
 if(!r.rows.length)fail('CONFLICT');
 await audit(db,s,'refurb.assessed',id,{from:expected,to:next,reason});
 return {body:{id,status:next}};
}
async function checkout(db,s,x){
 const requestId=uuid(x.requestId),o=s.organizationId,b=s.branchId;
 if(!Array.isArray(x.lines)||!x.lines.length||x.lines.length>50||!Array.isArray(x.payments)||!x.payments.length||x.payments.length>5)fail('INVALID_INPUT');
 const keys=new Set();const lines=x.lines.map(l=>{
  if(!['product','repair','refurbished'].includes(l?.type))fail('INVALID_INPUT');
  const id=uuid(l.id),qty=l.type==='product'?quantity(l.quantity):1,key=l.type+':'+id;
  if(keys.has(key)||l.type!=='product'&&l.quantity!==1)fail('INVALID_INPUT');keys.add(key);return {type:l.type,id,quantity:qty};
 }).sort((a,b)=>(a.type+':'+a.id).localeCompare(b.type+':'+b.id));
 const payments=x.payments.map(p=>{if(!['cash','card','transfer'].includes(p?.method)||!Number.isSafeInteger(p.amountCents)||p.amountCents<1||p.amountCents>1e12)fail('INVALID_INPUT');
  const reference=optional(p.reference,100);if(p.method==='card'&&!reference||p.method==='transfer'&&p.received!==true)fail('INVALID_INPUT');return {method:p.method,amountCents:p.amountCents,reference};});
 const digest=hash({lines,payments});
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[o+':sale:'+requestId]);
 const previous=await db.query('SELECT id,reference,total_cents,request_hash FROM rf_sales WHERE organization_id=$1 AND request_id=$2',[o,requestId]);
 if(previous.rows.length){const row=previous.rows[0];if(row.request_hash!==digest)fail('CONFLICT');return {body:{sale:{id:row.id,reference:row.reference,totalCents:Number(row.total_cents)},replayed:true}}}
 const businessDate=(await db.query("SELECT (now() AT TIME ZONE 'Europe/Brussels')::date AS date")).rows[0].date;
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[o+':day:'+b+':'+dayKey(businessDate)]);
 const closed=await db.query('SELECT 1 FROM rf_cash_days WHERE organization_id=$1 AND branch_id=$2 AND business_date=$3',[o,b,businessDate]);if(closed.rows.length)fail('CONFLICT');
 let total=0;const snapshots=[];
 for(const l of lines){let row,amount;
  if(l.type==='product'){
   const r=await db.query('SELECT p.name,p.sku,p.unit_price_cents,p.active,q.quantity FROM rf_products p JOIN rf_stock_balances q ON q.organization_id=p.organization_id AND q.product_id=p.id AND q.branch_id=$2 WHERE p.organization_id=$1 AND p.id=$3 FOR UPDATE OF q',[o,b,l.id]);row=r.rows[0];if(!row||!row.active||Number(row.quantity)<l.quantity)fail('INSUFFICIENT_STOCK');
   amount=Number(row.unit_price_cents)*l.quantity;
  }else if(l.type==='refurbished'){
   const r=await db.query("SELECT description AS name,price_cents AS unit_price_cents,status FROM rf_refurbished WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE",[o,b,l.id]);row=r.rows[0];if(!row||row.status!=='available')fail('CONFLICT');amount=Number(row.unit_price_cents);
  }else{
   const r=await db.query('SELECT reference AS name,charge_cents,status FROM rf_repairs WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',[o,b,l.id]);row=r.rows[0];if(!row||row.status!=='Klaar')fail('CONFLICT');
   const paid=await db.query("SELECT coalesce(sum(l.line_total_cents),0) AS amount FROM rf_sale_lines l JOIN rf_sales v ON v.id=l.sale_id AND v.organization_id=l.organization_id WHERE l.organization_id=$1 AND l.repair_id=$2 AND v.status='completed'",[o,l.id]);
   amount=Number(row.charge_cents)-Number(paid.rows[0].amount);if(amount<=0)fail('CONFLICT');
  }
  if(!Number.isSafeInteger(amount)||amount<0||!Number.isSafeInteger(total+amount))fail('INVALID_INPUT');total+=amount;snapshots.push({...l,name:row.name,sku:row.sku||null,amount,unitPrice:amount/l.quantity});
 }
 if(total<1||payments.reduce((n,p)=>n+p.amountCents,0)!==total)fail('INVALID_INPUT');
 const reference='KAS-'+requestId;
 const inserted=await db.query('INSERT INTO rf_sales(organization_id,branch_id,reference,request_id,request_hash,subtotal_cents,total_cents,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$6,$7) RETURNING id',[o,b,reference,requestId,digest,total,s.id]);const saleId=inserted.rows[0].id;
 for(const l of snapshots){
  await db.query('INSERT INTO rf_sale_lines(organization_id,sale_id,product_id,repair_id,refurbished_id,description,sku_snapshot,quantity,unit_price_cents,line_total_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[o,saleId,l.type==='product'?l.id:null,l.type==='repair'?l.id:null,l.type==='refurbished'?l.id:null,l.name,l.sku,l.quantity,l.unitPrice,l.amount]);
  if(l.type==='product'){
   const changed=await db.query('UPDATE rf_stock_balances SET quantity=quantity-$4,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND product_id=$3 AND quantity >= $4',[o,b,l.id,l.quantity]);if(changed.rowCount!==1)fail('INSUFFICIENT_STOCK');
   await db.query("INSERT INTO rf_stock_movements(organization_id,branch_id,product_id,sale_id,quantity_delta,reason,recorded_by) VALUES($1,$2,$3,$4,$5,'sale',$6)",[o,b,l.id,saleId,-l.quantity,s.id]);
  }else if(l.type==='refurbished'){
   const changed=await db.query("UPDATE rf_refurbished SET status='sold',updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3 AND status='available'",[o,b,l.id]);if(changed.rowCount!==1)fail('CONFLICT');
  }
 }
 for(const p of payments)await db.query("INSERT INTO rf_sale_payments(organization_id,sale_id,amount_cents,method,payment_state,provider_reference) VALUES($1,$2,$3,$4,'recorded',$5)",[o,saleId,p.amountCents,p.method,p.reference]);
 await audit(db,s,'sale.recorded',saleId,{totalCents:total,lineCount:lines.length,paymentCount:payments.length});
 return {status:201,body:{sale:{id:saleId,reference,totalCents:total,lines:snapshots,payments:payments.map(p=>({...p,state:'recorded'}))},replayed:false}};
}
async function receipt(db,s,x){
 const id=uuid(x.saleId),o=s.organizationId,b=s.branchId;
 const sale=(await db.query('SELECT id,reference,total_cents,sold_at FROM rf_sales WHERE organization_id=$1 AND branch_id=$2 AND id=$3',[o,b,id])).rows[0];if(!sale)fail('NOT_FOUND');
 const lines=(await db.query('SELECT description,quantity,unit_price_cents,line_total_cents FROM rf_sale_lines WHERE organization_id=$1 AND sale_id=$2',[o,id])).rows;
 const payments=(await db.query('SELECT amount_cents,method,payment_state,provider_reference FROM rf_sale_payments WHERE organization_id=$1 AND sale_id=$2',[o,id])).rows;
 return {body:{sale,lines,payments,notice:'Betalingen administratief geregistreerd; geen fiscale factuur of externe betaalbevestiging.'}};
}
async function closeDay(db,s){
 const o=s.organizationId,b=s.branchId;
 const date=(await db.query("SELECT (now() AT TIME ZONE 'Europe/Brussels')::date AS date")).rows[0].date;
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[o+':day:'+b+':'+dayKey(date)]);
 const prior=(await db.query('SELECT id,total_cents FROM rf_cash_days WHERE organization_id=$1 AND branch_id=$2 AND business_date=$3',[o,b,date])).rows[0];if(prior)return {body:{day:prior,replayed:true}};
 const sum=(await db.query("SELECT coalesce(sum(total_cents),0) AS amount FROM rf_sales WHERE organization_id=$1 AND branch_id=$2 AND status='completed' AND (sold_at AT TIME ZONE 'Europe/Brussels')::date=$3",[o,b,date])).rows[0].amount;
 const row=(await db.query('INSERT INTO rf_cash_days(organization_id,branch_id,business_date,total_cents,closed_by) VALUES($1,$2,$3,$4,$5) RETURNING id,business_date,total_cents',[o,b,date,sum,s.id])).rows[0];
 await audit(db,s,'cash_day.closed',row.id,{totalCents:Number(sum)});return {status:201,body:{day:row,replayed:false}};
}
async function correction(db,s,x){
 const requestId=uuid(x.requestId),dayId=uuid(x.dayId),reason=label(x.reason,500),delta=x.deltaCents;
 if(reason.length<5||!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>1e12)fail('INVALID_INPUT');
 const o=s.organizationId,b=s.branchId;
 const day=(await db.query('SELECT id,total_cents FROM rf_cash_days WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',[o,b,dayId])).rows[0];if(!day)fail('NOT_FOUND');
 const prior=(await db.query('SELECT id,day_id,delta_cents,reason FROM rf_cash_corrections WHERE organization_id=$1 AND request_id=$2',[o,requestId])).rows[0];
 if(prior){if(prior.day_id!==dayId||Number(prior.delta_cents)!==delta||prior.reason!==reason)fail('CONFLICT');return {body:{correctionId:prior.id,replayed:true}}}
 const previousTotal=(await db.query('SELECT coalesce(sum(delta_cents),0) AS cents FROM rf_cash_corrections WHERE organization_id=$1 AND branch_id=$2 AND day_id=$3',[o,b,dayId])).rows[0].cents;
 if(Number(day.total_cents)+Number(previousTotal)+delta<0)fail('CONFLICT');
 const r=await db.query('INSERT INTO rf_cash_corrections(organization_id,branch_id,day_id,request_id,delta_cents,reason,approved_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id',[o,b,dayId,requestId,delta,reason,s.id]);
 const row=r.rows[0]||(await db.query('SELECT id,day_id,delta_cents,reason FROM rf_cash_corrections WHERE organization_id=$1 AND request_id=$2',[o,requestId])).rows[0];
 if(!row||!r.rows.length&&(row.day_id!==dayId||Number(row.delta_cents)!==delta||row.reason!==reason))fail('CONFLICT');
 if(r.rows.length)await audit(db,s,'cash_day.correction',row.id,{dayId,deltaCents:delta,reason});
 return {status:r.rows.length?201:200,body:{correctionId:row.id,replayed:!r.rows.length}};
}
async function perform(db,staff,req){
 if(req.method==='GET')return req.query?.saleId?receipt(db,staff,req.query):list(db,staff);
 const x=req.body;
 const actions={customer,repair,changeRepair,product,stock,refurb,assess,checkout,closeDay,correction};
 if(typeof x.action!=='string'||!Object.hasOwn(actions,x.action))fail('INVALID_INPUT');
 return actions[x.action](db,staff,x);
}
module.exports={perform,customer,checkout,stock,refurb,changeRepair,closeDay,correction};
