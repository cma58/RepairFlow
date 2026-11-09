'use strict';
const crypto=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const terminal=new Set(['Geannuleerd','Afgekeurd','Niet herstelbaar','Niet hersteld']);
const transitions={Binnengebracht:['Diagnose','Geannuleerd','Afgekeurd','Niet herstelbaar'],Diagnose:['Wachten op klant','Wachten op onderdeel','In reparatie','Geannuleerd','Afgekeurd','Niet herstelbaar','Niet hersteld'],'Wachten op klant':['In reparatie','Wachten op onderdeel','Geannuleerd','Afgekeurd','Niet herstelbaar','Niet hersteld'],'Wachten op onderdeel':['In reparatie','Geannuleerd','Niet herstelbaar'],'In reparatie':['Kwaliteitscontrole','Wachten op onderdeel','Geannuleerd','Afgekeurd','Niet herstelbaar'],Kwaliteitscontrole:['In reparatie','Klaar'],Klaar:['Afgehaald'],'Niet hersteld':['Afgehaald'],'Niet herstelbaar':['Afgehaald'],Afgekeurd:['Afgehaald'],Geannuleerd:['Afgehaald']};
function fail(code){const e=Error(code);e.code=code;throw e}
function id(value){if(typeof value!=='string'||!UUID.test(value))fail('INVALID_INPUT');return value}
function text(value,min=1,max=1000){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail('INVALID_INPUT');return value.trim()}
function cents(value){if(!Number.isSafeInteger(value)||value<0||value>1e12)fail('INVALID_INPUT');return value}
function imei(value){if(value==null||String(value).trim()==='')return null;if(typeof value!=='string')fail('INVALID_INPUT');const v=value.replace(/[ -]/g,'');if(!/^\d{15}$/.test(v)||/^0+$/.test(v))fail('INVALID_INPUT');const sum=[...v].slice(0,14).reduce((n,d,i)=>{const x=Number(d)*(i%2?2:1);return n+Math.floor(x/10)+x%10},0);if((10-sum%10)%10!==Number(v[14]))fail('INVALID_INPUT');return v}
function identifiers(x){const a=imei(x.imei1),b=imei(x.imei2);if(a&&a===b)fail('INVALID_INPUT');const serial=x.serial==null||x.serial===''?null:text(x.serial,1,100);return {imei1:a,imei2:b,serial}}
const display=r=>r.outcome||r.status;
function paidSQL(alias='r'){return `coalesce((SELECT sum(l.line_total_cents) FROM rf_sale_lines l JOIN rf_sales v ON v.id=l.sale_id AND v.organization_id=l.organization_id WHERE l.organization_id=${alias}.organization_id AND l.repair_id=${alias}.id AND v.status='completed'),0)+coalesce((SELECT sum(p.amount_cents) FROM rf_repair_payments p WHERE p.organization_id=${alias}.organization_id AND p.branch_id=${alias}.branch_id AND p.repair_id=${alias}.id),0)`}
async function paid(db,s,repairId){const r=await db.query(`SELECT coalesce(sum(l.line_total_cents),0)+
 (SELECT coalesce(sum(p.amount_cents),0) FROM rf_repair_payments p WHERE p.organization_id=$1 AND p.branch_id=$3 AND p.repair_id=$2) AS amount
 FROM rf_sale_lines l JOIN rf_sales v ON v.id=l.sale_id AND v.organization_id=l.organization_id WHERE l.organization_id=$1 AND l.repair_id=$2 AND v.status='completed'`,[s.organizationId,repairId,s.branchId]);return Number(r.rows[0].amount)}

async function event(db,s,r,action,detail){await db.query('INSERT INTO rf_activity(organization_id,branch_id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[s.organizationId,s.branchId,s.id,action,r.id,JSON.stringify(detail)])}
async function statusEvent(db,s,r,next){await db.query('INSERT INTO rf_repair_status_events(organization_id,repair_id,from_status,to_status,changed_by) VALUES($1,$2,$3,$4,$5)',[s.organizationId,r.id,display(r),next,s.id])}
async function update(db,s,r,changes){const keys=Object.keys(changes),params=[s.organizationId,s.branchId,r.id,...Object.values(changes)];await db.query('UPDATE rf_repairs SET '+(keys.length?keys.map((k,i)=>k+'=$'+(i+4)).join(',')+',':'')+'version=version+1,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3',params);Object.assign(r,changes);r.version++}
async function paymentInput(x){if(!['cash','card','transfer'].includes(x.method))fail('INVALID_INPUT');const reference=x.reference?text(x.reference,1,100):null;if(x.method==='card'&&!reference||x.method==='transfer'&&x.received!==true)fail('INVALID_INPUT');return {method:x.method,reference}}
async function dayOpen(db,s){const day=(await db.query("SELECT (now() AT TIME ZONE 'Europe/Brussels')::date AS date")).rows[0].date;const key=day instanceof Date?day.toISOString().slice(0,10):String(day).slice(0,10);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[s.organizationId+':day:'+s.branchId+':'+key]);if((await db.query('SELECT 1 FROM rf_cash_days WHERE organization_id=$1 AND branch_id=$2 AND business_date=$3',[s.organizationId,s.branchId,day])).rows.length)fail('DAY_CLOSED')}
async function command(db,s,x,deps={}){
 if(!['owner','manager'].includes(s.role))fail('ACCESS_DENIED');
 const requestId=id(x.requestId),repairId=id(x.repairId);if(!Number.isSafeInteger(x.expectedVersion)||x.expectedVersion<0)fail('INVALID_INPUT');
 const supported=['status','reopen','identifiers','diagnosis','proposal','decision','approveLegacy','payment','correction','install'];if(!supported.includes(x.command))fail('INVALID_INPUT');
 const digest=crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'),o=s.organizationId,b=s.branchId;
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[o+':repair-command:'+requestId]);
 const prior=(await db.query('SELECT repair_id,request_hash,result FROM rf_repair_commands WHERE organization_id=$1 AND branch_id=$2 AND request_id=$3',[o,b,requestId])).rows[0];
 if(prior){if(prior.repair_id!==repairId||prior.request_hash!==digest)fail('CONFLICT');return {body:{...prior.result,replayed:true}}}
 if(['payment','correction'].includes(x.command))await dayOpen(db,s);
 const r=(await db.query('SELECT * FROM rf_repairs WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',[o,b,repairId])).rows[0];if(!r)fail('NOT_FOUND');if(r.version!==x.expectedVersion)fail('VERSION_CONFLICT');
 const before={status:display(r),version:r.version,chargeCents:Number(r.charge_cents),diagnosisFeeCents:Number(r.diagnosis_fee_cents),imei1:r.imei1,imei2:r.imei2,serial:r.device_serial};
 const oldStatus=display(r),amountPaid=await paid(db,s,r.id);let detail={};
 if(x.command==='identifiers'){
  if(r.status==='Afgehaald')fail('CONFLICT');const v=identifiers(x);await update(db,s,r,{imei1:v.imei1,imei2:v.imei2,device_serial:v.serial});detail={fields:['imei1','imei2','serial']};
 }else if(x.command==='diagnosis'){
  const fee=cents(x.diagnosisFeeCents);if(r.quote_approved_at||r.open_quote_id||amountPaid>0||!['Binnengebracht','Diagnose'].includes(r.status))fail('CONFLICT');await update(db,s,r,{diagnosis_fee_cents:fee});detail={diagnosisFeeCents:fee};
 }else if(x.command==='proposal'){
  if(r.open_quote_id||r.parts_finalized||terminal.has(oldStatus)||!['Diagnose','Wachten op klant','In reparatie','Kwaliteitscontrole','Wachten op onderdeel'].includes(r.status))fail('CONFLICT');
  const proposed=cents(x.totalCents),scope=text(x.scope,5),kind=r.quote_approved_at?'supplement':'initial';if(kind==='supplement'&&proposed<=Number(r.charge_cents)||proposed<amountPaid)fail('INVALID_INPUT');
  const partId=x.partProductId?id(x.partProductId):null,partQty=partId?x.partQuantity:null;if(partId&&(!Number.isSafeInteger(partQty)||partQty<1||partQty>999))fail('INVALID_INPUT');if(partId&&!(await db.query("SELECT id FROM rf_products WHERE organization_id=$1 AND id=$2 AND active=true AND kind='part'",[o,partId])).rows.length)fail('NOT_FOUND');
  const quote=(await db.query('INSERT INTO rf_repair_quotes(organization_id,branch_id,repair_id,kind,base_charge_cents,proposed_total_cents,scope,created_by,part_product_id,part_quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[o,b,r.id,kind,r.charge_cents,proposed,scope,s.id,partId,partQty])).rows[0];
  await statusEvent(db,s,r,'Wachten op klant');await update(db,s,r,{open_quote_id:quote.id,status:'Wachten op klant'});detail={quoteId:quote.id,kind,proposedTotalCents:proposed};
 }else if(x.command==='decision'){
  const quoteId=id(x.quoteId);if(r.open_quote_id!==quoteId||r.status!=='Wachten op klant'||!['accepted','declined'].includes(x.decision)||!['oral','email'].includes(x.method))fail('CONFLICT');const note=text(x.note,10);
  const q=(await db.query('SELECT id,kind,proposed_total_cents,scope,part_product_id,part_quantity FROM rf_repair_quotes WHERE organization_id=$1 AND branch_id=$2 AND repair_id=$3 AND id=$4',[o,b,r.id,quoteId])).rows[0];if(!q)fail('NOT_FOUND');
  await db.query('INSERT INTO rf_repair_quote_decisions(organization_id,branch_id,repair_id,quote_id,decision,method,note,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[o,b,r.id,quoteId,x.decision,x.method,note,s.id]);
  if(x.decision==='accepted'){await update(db,s,r,{open_quote_id:null,charge_cents:q.proposed_total_cents,quote_approved_at:new Date(),quote_approved_by:s.id,quote_approval_method:x.method,quote_approval_note:note,quote_approved_charge_cents:q.proposed_total_cents});if(q.part_product_id)await deps.stock(db,s,{operation:'reserve',repairId:r.id,productId:q.part_product_id,quantity:q.part_quantity,requestId:x.requestId,expectedVersion:r.version});if(q.part_product_id)r.version++}
  else if(q.kind==='initial'){await deps.releaseReservations(db,s,r.id,'quote.declined');await statusEvent(db,s,r,'Niet hersteld');await update(db,s,r,{open_quote_id:null,status:'Geannuleerd',outcome:'Niet hersteld',charge_cents:r.diagnosis_fee_cents})}
  else await update(db,s,r,{open_quote_id:null});
  detail={quoteId,decision:x.decision,method:x.method};
 }else if(x.command==='approveLegacy'){
  if(r.open_quote_id||r.status!=='Wachten op klant'||r.quote_approved_at||!['oral','email'].includes(x.method))fail('CONFLICT');const note=text(x.note,10);
  await update(db,s,r,{quote_approved_at:new Date(),quote_approved_by:s.id,quote_approval_method:x.method,quote_approval_note:note,quote_approved_charge_cents:r.charge_cents});
  if(x.partProductId)await deps.stock(db,s,{operation:'reserve',repairId:r.id,productId:x.partProductId,quantity:x.partQuantity,requestId:x.partRequestId,expectedVersion:r.version});if(x.partProductId)r.version++;detail={method:x.method,chargeCents:Number(r.charge_cents)};
 }else if(x.command==='payment'){
  const amount=cents(x.amountCents),p=await paymentInput(x);if(!amount||r.status==='Afgehaald'||amount>Number(r.charge_cents)-amountPaid)fail('INVALID_INPUT');
  const payment=(await db.query("INSERT INTO rf_repair_payments(organization_id,branch_id,repair_id,amount_cents,kind,method,reference,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",[o,b,r.id,amount,amountPaid===0?'deposit':'partial',p.method,p.reference,s.id])).rows[0];await update(db,s,r,{});detail={paymentId:payment.id,amountCents:amount,method:p.method,state:'recorded'};
 }else if(x.command==='correction'){
  const paymentId=id(x.paymentId),amount=cents(x.amountCents),reason=text(x.reason,5);if(!amount)fail('INVALID_INPUT');
  const original=(await db.query('SELECT amount_cents,method FROM rf_repair_payments WHERE organization_id=$1 AND branch_id=$2 AND repair_id=$3 AND id=$4',[o,b,r.id,paymentId])).rows[0];if(!original||Number(original.amount_cents)<=0)fail('NOT_FOUND');
  const reversed=Number((await db.query('SELECT coalesce(sum(-amount_cents),0) AS amount FROM rf_repair_payments WHERE organization_id=$1 AND branch_id=$2 AND repair_id=$3 AND corrects_payment_id=$4',[o,b,r.id,paymentId])).rows[0].amount);
  if(amount>Number(original.amount_cents)-reversed||amount>amountPaid||r.status==='Afgehaald')fail('CONFLICT');
  await db.query("INSERT INTO rf_repair_payments(organization_id,branch_id,repair_id,amount_cents,kind,method,corrects_payment_id,reason,recorded_by) VALUES($1,$2,$3,$4,'correction',$5,$6,$7,$8)",[o,b,r.id,-amount,original.method,paymentId,reason,s.id]);await update(db,s,r,{});detail={paymentId,amountCents:-amount,reason};
 }else if(x.command==='install'){
  const note=text(x.note,5);if(r.status!=='In reparatie'||r.open_quote_id||r.parts_finalized)fail('CONFLICT');
  if(Number(r.charge_cents)>0&&(!r.quote_approved_at||Number(r.quote_approved_charge_cents)!==Number(r.charge_cents)))fail('APPROVAL_REQUIRED');
  const reserved=(await db.query("SELECT id FROM rf_part_reservations WHERE organization_id=$1 AND branch_id=$2 AND repair_id=$3 AND status='reserved' ORDER BY product_id,id FOR UPDATE",[o,b,r.id])).rows;if(!reserved.length)fail('CONFLICT');
  await deps.finalizeReservations(db,s,r.id,null);await update(db,s,r,{});detail={note,reservations:reserved.map(p=>p.id)};
 }else if(x.command==='reopen'){
  const reason=text(x.reason,5);if(!terminal.has(oldStatus)||r.parts_finalized||r.open_quote_id)fail('CONFLICT');await statusEvent(db,s,r,'Diagnose');await update(db,s,r,{status:'Diagnose',outcome:null,quote_approved_at:null,quote_approved_charge_cents:null});detail={from:oldStatus,to:'Diagnose',reason};
 }else if(x.command==='status'){
  const next=text(x.status,1,60);if(!transitions[oldStatus]?.includes(next)||r.open_quote_id)fail('CONFLICT');
  if(next==='In reparatie'&&Number(r.charge_cents)>0&&(!r.quote_approved_at||Number(r.quote_approved_charge_cents)!==Number(r.charge_cents)))fail('APPROVAL_REQUIRED');
  if(r.status==='Kwaliteitscontrole'&&next==='Klaar'&&x.testPassed!==true)fail('INVALID_INPUT');
  if(r.status==='Kwaliteitscontrole'&&next==='In reparatie')text(x.reason,5);
  const closing=terminal.has(next),reason=closing||r.status==='Kwaliteitscontrole'&&next==='In reparatie'?text(x.reason,5):null;
  if(next==='Afgehaald'){
   if(amountPaid!==Number(r.charge_cents))fail('BALANCE_DUE');
   if(!r.parts_finalized){await deps.finalizeReservations(db,s,r.id,null);r.parts_finalized=true}
  }
  if(closing)await deps.releaseReservations(db,s,r.id,'repair.'+next);
  await statusEvent(db,s,r,next);await update(db,s,r,{status:closing?'Geannuleerd':next,outcome:closing&&next!=='Geannuleerd'?next:null,parts_finalized:r.parts_finalized,...(closing&&!r.quote_approved_at?{charge_cents:r.diagnosis_fee_cents}:{})});detail={from:oldStatus,to:next,reason};
 }
 await event(db,s,r,'repair.'+x.command,{...detail,before,after:{status:display(r),version:r.version,chargeCents:Number(r.charge_cents),diagnosisFeeCents:Number(r.diagnosis_fee_cents),imei1:r.imei1,imei2:r.imei2,serial:r.device_serial}});
 const newPaid=await paid(db,s,r.id);const result={id:r.id,version:r.version,status:display(r),chargeCents:Number(r.charge_cents),paidCents:newPaid,balanceCents:Number(r.charge_cents)-newPaid,...detail};
 await db.query('INSERT INTO rf_repair_commands(organization_id,branch_id,request_id,repair_id,command,request_hash,result,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',[o,b,requestId,r.id,x.command,digest,JSON.stringify(result),s.id]);
 return {body:result};
}
module.exports={command,imei,identifiers,cents,paidSQL,paid,display,transitions};
