'use strict';
/* Read-only ERP bridge. Legacy records are never rewritten or silently merged. */
(()=>{
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const read=(key,defaultValue)=>{try{return JSON.parse(localStorage.getItem(key))??defaultValue}catch{return defaultValue}};
 const euro=n=>new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(Number(n)||0);
 const all=()=>{
 const rawRepairs=read('rf07v3',{}),repairs=rawRepairs&&typeof rawRepairs==='object'&&!Array.isArray(rawRepairs)?Object.values(rawRepairs):[];
 const customers=read('rfCustomersV1',[]),refurb=read('rfRefurbV1',[]),products=read('rfPosProductsV1',[]),sales=read('rfPosSalesV1',[]),legacyParts=read('rfInventoryV3',{});
 const validArray=a=>Array.isArray(a)?a:[];
 const legacyStock=legacyParts&&typeof legacyParts==='object'&&!Array.isArray(legacyParts)?Object.keys(legacyParts).length:0;
 return {repairs,customers:validArray(customers),refurb:validArray(refurb),products:validArray(products),sales:validArray(sales),legacyStock};
 };
 function render(){
 const el=$('accounting');if(!el)return;const d=all(),open=d.repairs.filter(r=>r&&!['Afgehaald','Geannuleerd'].includes(r.status)).length;
 const available=d.refurb.filter(r=>r&&r.status==='Verkoopklaar').length;
 const active=d.products.filter(p=>p.active!==false);
 const low=active.filter(p=>Number(p.stock)<=2).length;
 const revenue=d.sales.reduce((n,s)=>n+(Number(s.total)||0),0);
 el.innerHTML='<div class="rf-erp-heading"><div><h2>Bedrijfsoverzicht</h2><p>Reparaties, klanten, refurbished en kassa op één plaats.</p></div><span class="rf-local-pill">Alleen deze browser</span></div>'+
 '<div class="rf-erp-stats"><div><span>Open reparaties</span><strong>'+open+'</strong></div><div><span>Refurbished verkoopklaar</span><strong>'+available+'</strong></div><div><span>Kassaomzet totaal</span><strong>'+euro(revenue)+'</strong></div></div>'+
 '<div class="rf-erp-panel" style="margin-top:18px"><h3>Gegevensbronnen</h3><div class="rf-erp-stock-row"><span>Reparatiedossiers</span><strong>'+d.repairs.length+'</strong></div><div class="rf-erp-stock-row"><span>Klanten in klantenmodule</span><strong>'+d.customers.length+'</strong></div><div class="rf-erp-stock-row"><span>Refurbished toestellen</span><strong>'+d.refurb.length+'</strong></div><div class="rf-erp-stock-row"><span>Kassa-artikelen</span><strong>'+active.length+'</strong></div><div class="rf-erp-stock-row"><span>Artikelen met lage voorraad (0–2)</span><strong>'+low+'</strong></div><div class="rf-erp-stock-row"><span>Legacy onderdelenreferenties</span><strong>'+d.legacyStock+'</strong></div><div class="rf-erp-stock-row"><span>Geregistreerde kassaverkopen</span><strong>'+d.sales.length+'</strong></div></div>'+
 '<div class="rf-erp-panel" style="margin-top:18px"><h3>Wat is nog niet gekoppeld?</h3><p>De reparatievoorraad, refurbished voorraad en kassavoorraad worden afzonderlijk bewaard. Er wordt nog geen voorraad tussen modules overgedragen. Klantrecords kunnen in meerdere modules voorkomen zonder automatische samenvoeging.</p><p>De getoonde kassaomzet omvat geen reparatiebetalingen of refurbished verkopen. Dit scherm is geen officiële boekhouding of btw-rapportage.</p><button class="btn s" data-rf-bridge="refresh">Cijfers vernieuwen</button></div>';
 }
 function backupCheck(file){
 if(file.size>12*1024*1024)throw Error('Bestand is te groot (max. 12 MB).');
 return file.text().then(text=>{
 const d=JSON.parse(text);if(d.format!=='RepairFlow-browser-backup'||d.version!==1||!d.keys||typeof d.keys!=='object'||Array.isArray(d.keys))throw Error('Dit is geen herkenbare RepairFlow-back-up.');
 const keys=Object.keys(d.keys);if(keys.length>150)throw Error('Te veel gegevensvelden.');
 if(keys.some(k=>!/^rf[a-zA-Z0-9_-]*$|^repairflow[a-zA-Z0-9_-]*$/i.test(k)||typeof d.keys[k]!=='string'))throw Error('Back-up bevat ongeldige velden.');
 const relevant=['rf07v3','rfInventoryV3','rfCustomersV1','rfRefurbV1','rfPosProductsV1','rfPosSalesV1'];const result=relevant.map(k=>[k,keys.includes(k)?'aanwezig':'ontbreekt']);
 return {date:d.exportedAt||'onbekend',keys:result};
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
 document.addEventListener('click',e=>{if(e.target.closest('[data-rf-bridge="refresh"]'))render();const nav=e.target.closest('[data-page]');if(nav&&nav.dataset.page==='accounting')queueMicrotask(render);});
 document.addEventListener('change',async e=>{if(e.target.id!=='rfBackupFile')return;const out=$('rfBackupResult');if(!out)return;try{const file=e.target.files?.[0];if(!file)return;const result=await backupCheck(file);out.textContent='Back-up van '+result.date+'. '+result.keys.map(([k,v])=>k+': '+v).join(' · ')+'. Geen gegevens gewijzigd.';}catch(err){out.textContent='Controle mislukt: '+err.message;}});
 init();
})();
