'use strict';
/* Read-only ERP bridge. Legacy records are never rewritten or silently merged. */
(()=>{
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const read=(key,defaultValue)=>{try{return JSON.parse(localStorage.getItem(key))??defaultValue}catch{return defaultValue}};
 const euro=n=>new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(Number(n)||0);
 const all=()=>{
 const rawRepairs=read('rf07v3',{}),repairs=rawRepairs&&typeof rawRepairs==='object'&&!Array.isArray(rawRepairs)?Object.entries(rawRepairs).map(([ticket,repair])=>({...repair,ticket})):[];
 const customersRaw=read('rfCustomersV1',{}),customers=Array.isArray(customersRaw)?customersRaw:Object.values(customersRaw&&typeof customersRaw==='object'?customersRaw:{}),refurb=read('rfRefurbV1',[]),products=read('rfPosProductsV1',[]),sales=read('rfPosSalesV1',[]),legacyParts=read('rfInventoryV3',{});
 const validArray=a=>Array.isArray(a)?a:[];
 const legacyStock=legacyParts&&typeof legacyParts==='object'&&!Array.isArray(legacyParts)?Object.keys(legacyParts).length:0;
 return {repairs,customers:validArray(customers),refurb:validArray(refurb),products:validArray(products),sales:validArray(sales),legacyStock};
 };
 const amount=v=>Number.isFinite(Number(v))?Number(v):0;
 const aggregate=d=>{
  const pos=d.sales.filter(s=>s&&s.status==='paid').map(s=>({key:'pos:'+s.id,source:'Kassa',reference:s.number||s.id,at:s.at,amount:amount(s.total),customer:s.customer||'Balieverkoop',method:s.method||'Onbekend'}));
  const refurbished=d.refurb.filter(r=>r&&r.status==='Verkocht'&&r.sale).map(r=>({key:'refurb:'+r.id,source:'Refurbished',reference:r.id,at:r.sale.at,amount:amount(r.sale.amount),customer:r.sale.customerName||'Onbekend',method:'Niet vastgelegd'}));
  const repairs=d.repairs.flatMap(r=>(Array.isArray(r?.payments)?r.payments:[]).filter(p=>p&&p.status==='confirmed').map(p=>({key:'repair:'+r.ticket+':'+p.id,source:'Reparatie',reference:r.ticket||r.id||'Reparatie',at:p.at,amount:amount(p.amount),customer:r.name||'Onbekend',method:p.method||'Onbekend'})));
  return [...pos,...refurb,...repairs].filter(x=>Number.isFinite(x.amount)&&x.amount>0).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
 };
 const total=rows=>Math.round(rows.reduce((n,x)=>n+x.amount,0)*100)/100;
 function render(){
 const el=$('accounting');if(!el)return;const d=all(),rows=aggregate(d);
 const open=d.repairs.filter(r=>r&&!['Afgehaald','Geannuleerd'].includes(r.status)).length;
 const ready=d.refurb.filter(r=>r&&r.status==='Verkoopklaar').length;
 const active=d.products.filter(p=>p.active!==false),low=active.filter(p=>Number(p.stock)<=2).length;
 const pos=rows.filter(x=>x.source==='Kassa'),refurb=rows.filter(x=>x.source==='Refurbished'),repair=rows.filter(x=>x.source==='Reparatie');
 const rowHtml=rows.slice(0,40).map(x=>'<div class="rf-erp-history"><div><strong>'+esc(x.reference)+'</strong><small>'+esc(x.source)+' · '+esc(x.customer)+' · '+esc(x.at?new Date(x.at).toLocaleString('nl-BE'):'Datum onbekend')+'</small></div><b>'+euro(x.amount)+'</b></div>').join('');
 el.innerHTML='<div class="rf-erp-heading"><div><h2>Bedrijfsoverzicht</h2><p>Verkoop- en ontvangstregistraties uit de bestaande modules, zonder dubbele invoer.</p></div><span class="rf-local-pill">Alleen deze browser</span></div>'+
 '<div class="rf-erp-stats"><div><span>Kassa-ontvangsten</span><strong>'+euro(total(pos))+'</strong></div><div><span>Refurbished verkopen</span><strong>'+euro(total(refurb))+'</strong></div><div><span>Reparatiebetalingen</span><strong>'+euro(total(repair))+'</strong></div></div>'+
 '<div class="rf-erp-panel" style="margin-top:18px"><h3>Samengevoegd overzicht van registraties</h3><div class="rf-erp-stock-row"><span>Totaal geregistreerde bedragen</span><strong>'+euro(total(rows))+'</strong></div><p class="rf-erp-hint">Let op: dit totaal combineert verkoopbedragen en ontvangen reparatiebetalingen, waaronder eventuele voorschotten. Het is geen boekhoudkundige omzet of btw-aangifte. Een refurbished verkoop wordt maar één keer geteld in de eigen module.</p><button class="btn s" data-rf-bridge="export">Overzicht exporteren (CSV)</button></div>'+
 '<div class="rf-erp-panel" style="margin-top:18px"><h3>Recente registraties</h3>'+(rowHtml||'<p class="muted">Nog geen verkopen of betalingen geregistreerd.</p>')+'</div>'+
 '<div class="rf-erp-panel" style="margin-top:18px"><h3>Operationele status</h3><div class="rf-erp-stock-row"><span>Open reparaties</span><strong>'+open+'</strong></div><div class="rf-erp-stock-row"><span>Verkoopklare refurbished toestellen</span><strong>'+ready+'</strong></div><div class="rf-erp-stock-row"><span>Klanten in klantenmodule</span><strong>'+d.customers.length+'</strong></div><div class="rf-erp-stock-row"><span>Actieve kassaproducten</span><strong>'+active.length+'</strong></div><div class="rf-erp-stock-row"><span>Artikelen met lage voorraad</span><strong>'+low+'</strong></div><div class="rf-erp-stock-row"><span>Legacy onderdelenreferenties</span><strong>'+d.legacyStock+'</strong></div></div>'+
 '<div class="rf-erp-panel" style="margin-top:18px"><h3>Belangrijke beperkingen</h3><p>Refurbished toestellen worden nog niet via de kassa afgerekend en hebben geen gedeelde voorraad met kassaproducten. De refurbished module registreert geen bevestigde betaalmethode. Reparatievoorschotten zijn ontvangsten, niet noodzakelijk gerealiseerde omzet.</p><p>Er is geen centrale database, echte betaalprovider of wettelijke facturatie. Dit overzicht leest alleen gegevens op dit toestel.</p><button class="btn s" data-rf-bridge="refresh">Cijfers vernieuwen</button></div>';
 }
 function exportCsv(){
  const rows=aggregate(all()),header=['Bron','Referentie','Datum','Klant','Betaalmethode','Bedrag EUR'];
  const data=[header,...rows.map(x=>[x.source,x.reference,x.at||'',x.customer,x.method,x.amount.toFixed(2)])];
  const csv='\uFEFF'+data.map(row=>row.map(v=>{let t=String(v??'');if(/^[=+@\\-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='repairflow-overzicht.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function backupCheck(file){
 if(file.size>12*1024*1024)throw Error('Bestand is te groot (max. 12 MB).');
 return file.text().then(text=>{
 const d=JSON.parse(text);
 if(!d||d.format!=='RepairFlow-browser-backup'||d.version!==1||!d.keys||typeof d.keys!=='object'||Array.isArray(d.keys))throw Error('Dit is geen herkenbare RepairFlow-back-up.');
 const keys=Object.keys(d.keys);if(keys.length>150)throw Error('Te veel gegevensvelden.');
 if(keys.some(k=>!(/^(rf|repairflow)[a-zA-Z0-9_-]*$/i.test(k))||typeof d.keys[k]!=='string'))throw Error('Back-up bevat ongeldige velden.');
 const relevant=[
 ['rf07v3','Reparaties'],['rfInventoryV3','Onderdelen'],['rfCustomersV1','Klanten'],
 ['rfRefurbV1','Refurbished'],['rfPosProductsV1','Kassaproducten'],
 ['rfPosSalesV1','Kassaverkopen'],['rfPosStockMovementsV1','Voorraadmutaties']
 ];
 const summary=relevant.map(([key,label])=>{
  if(!Object.prototype.hasOwnProperty.call(d.keys,key))return label+': ontbreekt';
  try{
   const value=JSON.parse(d.keys[key]);
   const count=Array.isArray(value)?value.length:value&&typeof value==='object'?Object.keys(value).length:null;
   return label+': '+(count===null?'formaat na te kijken':count+' records');
  }catch{return label+': beschadigd (ongeldige JSON)'}
 });
 const unexpected=keys.filter(k=>!relevant.some(([known])=>known===k)).length;
 if(unexpected)summary.push('Andere instellingen/modules: '+unexpected+' (niet geïmporteerd)');
 return {summary};
 });
 }
 function init(){
 const settings=$('settings');if(settings&&!$('rfBackupInspector')){
 const node=document.createElement('div');node.className='card rf-erp-backup';node.id='rfBackupInspector';
 node.innerHTML='<h3>Back-up controleren</h3><p>Controleer of een eerder gedownloade RepairFlow-back-up leesbaar is. Deze controle wijzigt niets aan je gegevens.</p><label for="rfBackupFile">Selecteer back-upbestand (.json)</label><input id="rfBackupFile" type="file" accept=".json,application/json"><p id="rfBackupResult" role="status" class="rf-erp-hint"></p>';
 settings.appendChild(node);
 }
 render();
 }
 document.addEventListener('click',e=>{if(e.target.closest('[data-rf-bridge="refresh"]'))render();if(e.target.closest('[data-rf-bridge="export"]'))exportCsv();const nav=e.target.closest('[data-page]');if(nav&&nav.dataset.page==='accounting')queueMicrotask(render);});
 document.addEventListener('change',async e=>{if(e.target.id!=='rfBackupFile')return;const out=$('rfBackupResult');if(!out)return;try{const file=e.target.files?.[0];if(!file)return;const result=await backupCheck(file);out.textContent='Controle voltooid. '+result.summary.join(' · ')+'. Geen gegevens gewijzigd of verstuurd.';}catch(err){out.textContent='Controle mislukt: '+err.message;}});
 init();
})();
