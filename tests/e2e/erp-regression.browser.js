'use strict';
// ERP regression in a real browser against real PostgreSQL after the P0 security
// changes. Runs the project's OWN existing runner tests/e2e/repair-phase21.html
// unchanged (previously only run by hand on a Vercel preview), plus POS/day-close
// checks. Uses the runner's fixed synthetic tenant 5555…/6666….
const {describe,it,before,after}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');const {Client}=require('pg');
const {startIsolatedDatabase}=require('../harness/postgres');
const {createSyntheticNeonAuth}=require('../harness/synthetic-neon-auth');
const {startAppServer}=require('../harness/app-server');
const {launch,browserSession}=require('../harness/browser');
const O='55555555-5555-4555-8555-555555555555',B='66666666-6666-4666-8666-666666666666';
const manager={id:'d1000000-0000-4000-8000-000000000001',email:'phase21.manager@e2e.invalid'};
const sales={id:'d1000000-0000-4000-8000-000000000002',email:'phase21.sales@e2e.invalid'};
const T={timeout:180000};let db,auth,app,browser,M;
async function sql(q,p){const c=new Client({connectionString:db.ownerUrl});await c.connect();try{return (await c.query(q,p)).rows}finally{await c.end()}}
before(async()=>{
 db=await startIsolatedDatabase();auth=createSyntheticNeonAuth(db.ownerUrl);
 await sql(`INSERT INTO rf_organizations(id,name) VALUES('${O}','E2E phase21 tenant');INSERT INTO rf_branches(id,organization_id,name) VALUES('${B}','${O}','E2E phase21 branch');
  INSERT INTO neon_auth."user"(id,email,name,"emailVerified") VALUES('${manager.id}','${manager.email}','E2E',true),('${sales.id}','${sales.email}','E2E',true);
  INSERT INTO rf_staff(organization_id,branch_id,identity_subject,display_name,role) VALUES('${O}','${B}','${manager.id}','E2E manager','manager'),('${O}','${B}','${sales.id}','E2E sales','sales');`);
 app=await startAppServer({database:db,auth,organizationId:O,branchId:B});
 browser=(await launch([app.spki])).browser;
 M=await browserSession(browser,app,auth,manager,{label:'R-phase21-manager'});
});
after(async()=>{await M?.close();await browser?.close();await app?.close();db?.stop()});

describe('Regressie — bestaande ERP-functionaliteit na P0-beveiligingswijzigingen',()=>{
 it('R1 bestaande phase21-runner: 8 reparatie-/betaalscenario’s (voorschot, diagnose, offerte, heropenen, reservering, race, responsverlies, gratis afhaling)',T,async()=>{
  await M.page.goto(app.origin+'/tests/e2e/repair-phase21.html');
  await M.page.click('#run');
  await M.page.waitForFunction(()=>/Alle 8 scenario|Suite gestopt/.test(document.getElementById('status').textContent),null,{timeout:150000});
  const status=await M.page.textContent('#status');const report=JSON.parse(await M.page.evaluate(()=>sessionStorage.getItem('phixarSyntheticPhase21Report')));
  await M.screenshot('R1-phase21-runner');
  assert.match(status,/Alle 8 scenario/,status);assert.equal(report.cases.length,8);assert.ok(report.cases.every(c=>c.passed),JSON.stringify(report.cases.filter(c=>!c.passed)));
 });
 it('R2 bestaande runner: controle na herladen leest opgeslagen dossier opnieuw uit de database',T,async()=>{
  await M.page.click('#reload');
  await M.page.waitForFunction(()=>/HERLAADCONTROLE GESLAAGD|niet bevestigd/.test(document.getElementById('status').textContent),null,{timeout:60000});
  assert.match(await M.page.textContent('#status'),/HERLAADCONTROLE GESLAAGD/);
 });
 it('R3 bestaande runner: installatie, annulering en heropenen zonder fictieve voorraad',T,async()=>{
  await M.page.click('#install');
  await M.page.waitForFunction(()=>/Installatieproef (geslaagd|gestopt)/.test(document.getElementById('status').textContent),null,{timeout:60000});
  assert.equal(await M.page.textContent('#status'),'Installatieproef geslaagd');
 });
 it('R4 kassa: voorraadontvangst, splitbetaling cash/kaart, dagafsluiting en verkoop na afsluiting geweigerd',T,async()=>{
  const id=()=>crypto.randomUUID();const api=(b,q='')=>M.api('/api/workspace'+q,b);
  const p=await api({action:'product',requestId:id(),sku:'E2E-ACC-'+id().slice(0,8),name:'E2E accessoire',kind:'accessory',priceCents:1000});assert.equal(p.status,201,JSON.stringify(p.body));
  const pid=p.body.product.id;
  assert.equal((await api({action:'stock',requestId:id(),operation:'receive',productId:pid,quantity:3})).status,201);
  const insufficient=await api({action:'checkout',requestId:id(),lines:[{type:'product',id:pid,quantity:5}],payments:[{method:'cash',amountCents:5000}]});assert.equal(insufficient.status,409);
  const noRef=await api({action:'checkout',requestId:id(),lines:[{type:'product',id:pid,quantity:2}],payments:[{method:'cash',amountCents:500},{method:'card',amountCents:1500}]});
  assert.equal(noRef.status,400,'card payment without terminal reference is refused (existing business rule)');
  const sale=await api({action:'checkout',requestId:id(),lines:[{type:'product',id:pid,quantity:2}],payments:[{method:'cash',amountCents:500},{method:'card',amountCents:1500,reference:'E2E-TERMINAL-0001'}]});
  assert.equal(sale.status,201,JSON.stringify(sale.body));
  const stockRow=await sql('SELECT quantity FROM rf_stock_balances WHERE product_id=$1',[pid]);assert.equal(Number(stockRow[0].quantity),1);
  const closed=await api({action:'closeDay'});assert.ok([200,201].includes(closed.status),JSON.stringify(closed.body));
  const after=await api({action:'checkout',requestId:id(),lines:[{type:'product',id:pid,quantity:1}],payments:[{method:'cash',amountCents:1000}]});
  // Existing contract (ERP-STATUS): POS checkout on a closed day is a definitive 409 conflict.
  assert.deepEqual([after.status,after.body],[409,{error:'conflict'}]);
  const salesCount=await sql('SELECT count(*)::int n FROM rf_sales WHERE organization_id=$1',[O]);
  assert.equal(Number(salesCount[0].n)>=1,true);
  const stock2=await sql('SELECT quantity FROM rf_stock_balances WHERE product_id=$1',[pid]);assert.equal(Number(stock2[0].quantity),1,'refused sale did not touch stock');
 });
 it('R5 rollen: verkoper krijgt geen brede werkruimte; zonder sessie geen gegevens',T,async()=>{
  const S=await browserSession(browser,app,auth,sales,{label:'R-sales'});
  try{assert.equal((await S.api('/api/workspace')).status,403);assert.deepEqual((await S.api('/api/auth/me')).body,{authenticated:true,role:'sales'})}finally{await S.close()}
  const anon=await browser.newContext();const pg=await anon.newPage();await pg.goto(app.origin+'/security');
  assert.equal(await pg.evaluate(async()=>(await fetch('/api/workspace')).status),401);await anon.close();
 });
});
