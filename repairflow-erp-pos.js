'use strict';
/* RepairFlow POS foundation — local-only. Never simulates payment-provider confirmation. */
(()=>{
 const PRODUCTS='rfPosProductsV1',SALES='rfPosSalesV1',DRAFT='rfPosCartV1',MOVEMENTS='rfPosStockMovementsV1';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(Number(n)||0);
 const read=(k,f)=>{try{const v=JSON.parse(localStorage.getItem(k));return v??f}catch{return f}};
 const products=()=>read(PRODUCTS,[]),sales=()=>read(SALES,[]);const customers=()=>{const x=read('rfCustomersV1',{});return (Array.isArray(x)?x:Object.values(x&&typeof x==='object'?x:{})).filter(c=>c&&c.name&&!c.archived)};
 const put=(k,v)=>{localStorage.setItem(k,JSON.stringify(v));};
 const movements=()=>read(MOVEMENTS,[]);
 const movement=(p,delta,reason,reference)=>({id:id(),at:new Date().toISOString(),productId:p.id,productName:p.name,delta,balance:p.stock,reason,reference:reference||null});
 function commitStock(ps,entries){const beforeProducts=localStorage.getItem(PRODUCTS),beforeMovements=localStorage.getItem(MOVEMENTS);try{put(MOVEMENTS,[...movements(),...entries]);put(PRODUCTS,ps);}catch(e){try{if(beforeProducts===null)localStorage.removeItem(PRODUCTS);else localStorage.setItem(PRODUCTS,beforeProducts);if(beforeMovements===null)localStorage.removeItem(MOVEMENTS);else localStorage.setItem(MOVEMENTS,beforeMovements)}catch{}throw e;}}

 let cart=read(DRAFT,[]),page='sales',query='',selectedCustomer='';
 const positive=n=>Number.isFinite(n)&&n>=0;
 const qtyInt=n=>Number.isSafeInteger(n)&&n>0;
 const stockInt=n=>Number.isSafeInteger(n)&&n>=0;
 const id=()=>globalThis.crypto?.randomUUID?.()||('rf-'+Date.now()+'-'+Math.random().toString(36).slice(2));
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 const activeProducts=()=>products().filter(p=>p.active!==false);
 const lineTotal=l=>round(l.qty*l.price);
 const total=()=>round(cart.reduce((sum,l)=>sum+lineTotal(l),0));
 const notify=m=>{const t=$('rfPosMessage');if(t){t.textContent=m;t.hidden=false;t.scrollIntoView({block:'nearest'});}else alert(m)};
 const opt=(v,selected)=>'<option value="'+esc(v)+'" '+(v===selected?'selected':'')+'>'+esc(v)+'</option>';
 function shell(){
 const salesEl=$('sales'),partsEl=$('parts'),paymentsEl=$('payments'),invoicesEl=$('invoices'),reportsEl=$('reports');
 if(salesEl)salesEl.innerHTML='<div id="rfPosRoot"></div>';
 if(partsEl)partsEl.innerHTML='<div id="rfStockRoot"></div>';
 if(paymentsEl)paymentsEl.innerHTML='<div id="rfPaymentsRoot"></div>';
 if(invoicesEl)invoicesEl.innerHTML='<div id="rfReceiptsRoot"></div>';
 if(reportsEl)reportsEl.innerHTML='<div id="rfReportsRoot"></div>';
 const settings=$('settings');if(settings){const section=document.createElement('section');section.className='rf-erp-backup card';section.innerHTML='<h3>Gegevensbeheer</h3><p>Maak regelmatig een back-up van alle RepairFlow-browsergegevens. Deze gegevens synchroniseren niet tussen toestellen.</p><button class="btn g" data-rf="backup">Back-up downloaden</button><p class="small muted">Importeren wordt pas beschikbaar na een geteste herstelprocedure.</p>';settings.appendChild(section);}
 }
 function header(title,subtitle){return '<div class="rf-erp-heading"><div><h2>'+title+'</h2><p>'+subtitle+'</p></div><span class="rf-local-pill">Op dit toestel</span></div><p id="rfPosMessage" class="rf-erp-message" role="status" hidden></p>';}
 function renderSales(){
 const el=$('rfPosRoot');if(!el)return;const ps=activeProducts().filter(p=>[p.name,p.sku,p.imei].some(v=>String(v||'').toLowerCase().includes(query.toLowerCase())));const count=sales().length;
 el.innerHTML=header('Kassa','Zoek een artikel, voeg het toe en registreer de betaling.')+
 '<div class="rf-pos-layout"><div class="rf-pos-catalog"><div class="rf-erp-toolbar"><input id="rfProductSearch" type="search" placeholder="Zoek op naam, SKU of IMEI" aria-label="Product zoeken" value="'+esc(query)+'"><button class="btn s" data-rf="stock-page">+ Product</button></div><div class="rf-pos-products">'+(ps.length?ps.map(p=>'<button class="rf-pos-product" data-rf="add" data-id="'+esc(p.id)+'"><strong>'+esc(p.name)+'</strong><small>'+esc(p.sku||'Geen SKU')+' · '+(p.stock||0)+' beschikbaar</small><b>'+money(p.price)+'</b></button>').join(''):'<div class="rf-erp-empty">Nog geen artikelen gevonden. Voeg eerst een product toe bij Voorraad.</div>')+'</div></div>'+
 '<div class="rf-pos-cart"><h3>Winkelmandje</h3><div class="rf-pos-lines">'+(cart.length?cart.map(l=>'<div class="rf-pos-line"><div><strong>'+esc(l.name)+'</strong><small>'+money(l.price)+' per stuk</small></div><div class="rf-pos-qty"><button data-rf="decrease" data-id="'+esc(l.id)+'" aria-label="Aantal verminderen">−</button><b>'+l.qty+'</b><button data-rf="increase" data-id="'+esc(l.id)+'" aria-label="Aantal verhogen">+</button></div><b>'+money(lineTotal(l))+'</b></div>').join(''):'<p class="muted">Nog geen artikelen geselecteerd.</p>')+'</div><div class="rf-pos-total"><span>Totaal incl. btw</span><strong>'+money(total())+'</strong></div><label class="rf-erp-label">Betaalmethode<select id="rfPaymentMethod"><option>Cash</option><option>Bancontact (extern bevestigd)</option><option>SumUp (extern bevestigd)</option><option>Overschrijving (ontvangen)</option></select></label><label class="rf-erp-label">Klant (optioneel)<select id="rfSaleCustomer"><option value="">Balieverkoop zonder klant</option>'+customers().map(c=>'<option value="'+esc(c.id)+'" '+(selectedCustomer===c.id?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><p class="rf-erp-hint">Bevestig alleen een betaling die je daadwerkelijk hebt ontvangen. Er is geen betaalterminal gekoppeld.</p><button class="btn g rf-full" data-rf="checkout" '+(!cart.length?'disabled':'')+'>Betaling ontvangen · '+money(total())+'</button><button class="btn s rf-full" data-rf="clear" '+(!cart.length?'disabled':'')+'>Winkelmandje leegmaken</button></div></div><p class="rf-erp-hint">Geregistreerde verkopen op dit toestel: '+count+'</p>';
 }
 function renderStock(){
 const el=$('rfStockRoot');if(!el)return;const ps=products();
 el.innerHTML=header('Producten & voorraad','Beheer verkoopartikelen. Reparatieonderdelen blijven voorlopig in de bestaande reparatiemodule.')+
 '<div class="rf-erp-grid"><form id="rfProductForm" class="rf-erp-panel"><h3>Nieuw artikel</h3><label>Naam *<input name="name" required maxlength="120" placeholder="Bijv. USB-C kabel"></label><label>SKU / barcode<input name="sku" maxlength="80"></label><label>IMEI / serienummer (indien uniek)<input name="imei" maxlength="80"></label><div class="rf-erp-two"><label>Verkoopprijs incl. btw (€) *<input name="price" type="number" min="0" step="0.01" required></label><label>Aankoopkost (€)<input name="cost" type="number" min="0" step="0.01" value="0"></label></div><div class="rf-erp-two"><label>Voorraad *<input name="stock" type="number" min="0" step="1" value="1" required></label><label>BTW-tarief<select name="vat"><option value="21">21%</option><option value="12">12%</option><option value="6">6%</option><option value="0">0%</option></select></label></div><p class="rf-erp-hint">Gebruik dit niet voor margeregeling of bijzondere btw-regimes zonder aparte configuratie.</p><button class="btn g rf-full" type="submit">Artikel bewaren</button></form>'+
 '<div class="rf-erp-panel"><h3>Voorraadlijst ('+ps.filter(p=>p.active!==false).length+')</h3><div class="rf-erp-stock-list">'+(ps.filter(p=>p.active!==false).map(p=>'<div class="rf-erp-stock-row"><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.sku||'Geen SKU')+' · '+money(p.price)+' · btw '+esc(p.vat)+'%</small></div><div><b>'+p.stock+' st.</b><div class="rf-erp-stock-actions"><button class="btn s" data-rf="stock-minus" data-id="'+esc(p.id)+'">−1</button><button class="btn s" data-rf="stock-plus" data-id="'+esc(p.id)+'">+1</button><button class="btn s" data-rf="archive" data-id="'+esc(p.id)+'">Archiveren</button></div></div></div>').join('')||'<p class="muted">Nog geen producten. Begin links.</p>')+'</div></div></div><div class="rf-erp-panel" style="margin-top:18px"><h3>Laatste voorraadbewegingen</h3>'+ (movements().length?movements().slice(-15).reverse().map(m=>'<div class="rf-erp-stock-row"><div><strong>'+esc(m.productName)+'</strong><small>'+esc(new Date(m.at).toLocaleString('nl-BE'))+' · '+esc(m.reason)+(m.reference?' · '+esc(m.reference):'')+'</small></div><b>'+(m.delta>0?'+':'')+m.delta+' → '+m.balance+'</b></div>').join(''):'<p class="muted">Nog geen voorraadbewegingen.</p>')+'</div>';
 }
 function renderHistory(){
 const el=$('rfPaymentsRoot');if(!el)return;const ss=sales().slice().reverse();
 el.innerHTML=header('Verkopen & betalingen','Geregistreerde verkopen met betaalmethode en ontvangstbewijs.')+'<div class="rf-erp-panel"><div class="rf-erp-toolbar"><h3>Verkoopgeschiedenis</h3><button class="btn s" data-rf="export">Export CSV</button></div>'+ (ss.length?ss.map(s=>'<div class="rf-erp-history"><div><strong>'+esc(s.number)+'</strong><small>'+esc(new Date(s.at).toLocaleString('nl-BE'))+' · '+esc(s.method)+' · '+esc(s.customer||'Balieverkoop')+'</small></div><strong>'+money(s.total)+'</strong><button class="btn s" data-rf="receipt" data-id="'+esc(s.id)+'">Bewijs</button></div>').join(''):'<p class="muted">Er zijn nog geen verkopen geregistreerd.</p>')+'</div>';
 }
 function renderReceipts(){
 const el=$('rfReceiptsRoot');if(!el)return;
 el.innerHTML=header('Verkoopbewijzen','Bewijzen voor lokaal geregistreerde kassaverkopen.')+'<div class="rf-erp-panel"><p>Een verkoopbewijs is niet automatisch een wettelijk correcte factuur. Factuurnummering, klantgegevens, Belgische btw-regels en e-facturatie moeten nog afzonderlijk worden uitgewerkt.</p><button class="btn g" data-rf="history-page">Verkoopgeschiedenis bekijken</button></div>';
 }
 function renderReports(){
 const el=$('rfReportsRoot');if(!el)return;const ss=sales(),today=new Date().toLocaleDateString('sv-SE');const todays=ss.filter(s=>new Date(s.at).toLocaleDateString('sv-SE')===today);
 const sum=a=>round(a.reduce((n,s)=>n+s.total,0));el.innerHTML=header('Kassarapport','Cijfers van geregistreerde kassaverkopen op deze browser.')+'<div class="rf-erp-stats"><div><span>Verkopen vandaag</span><strong>'+todays.length+'</strong></div><div><span>Omzet vandaag</span><strong>'+money(sum(todays))+'</strong></div><div><span>Totale kassaverkopen</span><strong>'+money(sum(ss))+'</strong></div></div><p class="rf-erp-hint">Reparatiebetalingen en refurbished verkopen zijn nog niet opgenomen in dit rapport. Dit is geen boekhoudkundige btw-aangifte.</p><button class="btn s" data-rf="export">Kassaverkopen exporteren</button>';
 }
 function render(){renderSales();renderStock();renderHistory();renderReceipts();renderReports();}
 function saveCart(){put(DRAFT,cart);renderSales();}
 function add(productId,change){
 const p=products().find(p=>p.id===productId&&p.active!==false);if(!p)return;
 const existing=cart.find(l=>l.id===p.id),next=(existing?.qty||0)+change;
 if(!stockInt(p.stock)||!qtyInt(next)&&next!==0||next>p.stock){notify('Ongeldige of onvoldoende voorraad. Controleer het artikel.');return;}
 if(next<=0)cart=cart.filter(l=>l.id!==p.id);
 else if(existing)existing.qty=next;
 else cart.push({id:p.id,name:p.name,sku:p.sku,imei:p.imei,price:p.price,vat:p.vat,qty:next});
 saveCart();
 }
 let checkoutInProgress=false;
 function checkout(){
 if(checkoutInProgress||!cart.length)return;
 const ps=products(),items=[];
 for(const l of cart){const p=ps.find(x=>x.id===l.id);if(!p||p.active===false||!qtyInt(l.qty)||!stockInt(p.stock)||p.stock<l.qty||!Number.isFinite(p.price)||p.price<0||p.price!==l.price){notify('Product, prijs of voorraad is veranderd. Controleer de winkelmand.');return;}items.push({...l});}
 const method=$('rfPaymentMethod')?.value||'Cash',customerId=$('rfSaleCustomer')?.value||'';
 const customerMatches=customerId?customers().filter(c=>c.id===customerId):[];
 if(customerId&&customerMatches.length!==1){notify('De geselecteerde klant bestaat niet meer of is dubbel geregistreerd. Kies opnieuw een klant.');return;}
 const customerRecord=customerMatches[0],customer=customerRecord?.name||'';
 const amount=total();if(!positive(amount)||amount<=0){notify('Een verkoop moet een positief totaal hebben.');return;}
 if(!confirm('Bevestig dat '+money(amount)+' daadwerkelijk ontvangen is via '+method+'?'))return;
 checkoutInProgress=true;
 const oldSales=sales(),number='KAS-'+new Date().getFullYear()+'-'+String(oldSales.length+1).padStart(6,'0');
 const sale={id:id(),number,at:new Date().toISOString(),items,total:amount,method,customer,customerId:customerRecord?.id||null,status:'paid',source:'local-pos'};
 const nextProducts=ps.map(p=>{const l=items.find(x=>x.id===p.id);return l?{...p,stock:p.stock-l.qty}:p});
 const oldProductsRaw=localStorage.getItem(PRODUCTS),oldMovementsRaw=localStorage.getItem(MOVEMENTS),oldSalesRaw=localStorage.getItem(SALES),oldDraftRaw=localStorage.getItem(DRAFT),previousCart=cart.slice(),previousCustomer=selectedCustomer;
 let saved=false;
 try{commitStock(nextProducts,items.map(l=>movement(nextProducts.find(p=>p.id===l.id),-l.qty,'Kassaverkoop',number)));put(SALES,[...oldSales,sale]);cart=[];selectedCustomer='';put(DRAFT,cart);saved=true;}
 catch(e){cart=previousCart;selectedCustomer=previousCustomer;try{for(const [key,value] of [[PRODUCTS,oldProductsRaw],[MOVEMENTS,oldMovementsRaw],[SALES,oldSalesRaw],[DRAFT,oldDraftRaw]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}}catch{}notify('Opslaan mislukt. Controleer de browseropslag.');}
 finally{checkoutInProgress=false;}
 if(saved){try{render();receipt(sale);notify('Verkoop '+number+' geregistreerd.');}catch(e){notify('Verkoop '+number+' opgeslagen. Open de verkoopgeschiedenis als het bewijs niet verschijnt.');}}
 }
 function receipt(s){
 const lines=s.items.map(l=>'<tr><td>'+esc(l.name)+'</td><td>'+l.qty+'</td><td>'+money(lineTotal(l))+'</td></tr>').join('');
 const html='<div class="rf-receipt"><h2>RepairFlow · Verkoopbewijs</h2><p>'+esc(s.number)+' · '+esc(new Date(s.at).toLocaleString('nl-BE'))+'</p><p>Klant: '+esc(s.customer||'Balieverkoop')+'</p><table><thead><tr><th>Artikel</th><th>Aantal</th><th>Totaal</th></tr></thead><tbody>'+lines+'</tbody></table><h2>Totaal: '+money(s.total)+'</h2><p>Betaling: '+esc(s.method)+'</p><p>Dit document is een verkoopbewijs, geen btw-factuur.</p><button class="btn g" data-rf="print">Afdrukken</button></div>';
 $('rfReceiptOverlay')?.remove();const box=document.createElement('div');box.className='rf-receipt-overlay';box.id='rfReceiptOverlay';box.innerHTML='<div class="rf-receipt-card"><button class="btn s" data-rf="close-receipt">Sluiten</button>'+html+'</div>';document.body.appendChild(box);
 }
 function csv(){const ss=sales(),rows=[['Nummer','Datum','Klant','Betaalmethode','Totaal EUR','Artikelen']];ss.forEach(s=>rows.push([s.number,s.at,s.customer,s.method,s.total.toFixed(2),s.items.map(l=>l.name+' x'+l.qty).join('; ')]));download('repairflow-kassaverkopen.csv','\uFEFF'+rows.map(r=>r.map(v=>{let x=String(v??'');if(/^[=+@\\-]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"'}).join(';')).join('\r\n'),'text/csv;charset=utf-8');}
 function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function backup(){const data={format:'RepairFlow-browser-backup',version:1,exportedAt:new Date().toISOString(),keys:{}};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&(/^(rf|repairflow)/i).test(k))data.keys[k]=localStorage.getItem(k);}download('repairflow-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(data,null,2),'application/json');}
 document.addEventListener('click',e=>{
 const b=e.target.closest('[data-rf]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
 const action=b.dataset.rf,pid=b.dataset.id;
 if(action==='add'||action==='increase')add(pid,1);
 else if(action==='decrease')add(pid,-1);
 else if(action==='clear'){if(confirm('Winkelmandje leegmaken?')){cart=[];saveCart();}}
 else if(action==='checkout')checkout();
 else if(action==='stock-page'){document.querySelector('[data-page="parts"]')?.click();}
 else if(action==='history-page'){document.querySelector('[data-page="payments"]')?.click();}
 else if(action==='stock-plus'||action==='stock-minus'||action==='archive'){
 const ps=products(),p=ps.find(x=>x.id===pid);if(!p)return;const oldStock=p.stock;
 if(!stockInt(oldStock)){notify('Voorraadgegevens zijn ongeldig. Corrigeer het artikel voordat je voorraad wijzigt.');return;}
 if(action==='archive'){if(!confirm('Artikel archiveren? Bestaande verkopen blijven behouden.'))return;p.active=false;}
 else {if(action==='stock-minus'&&p.stock<=0){notify('Voorraad kan niet negatief worden.');return;}p.stock+=action==='stock-plus'?1:-1;}
 try{commitStock(ps,action==='archive'?[]:[movement(p,p.stock-oldStock,'Handmatige voorraadcorrectie')]);render();}catch{notify('Voorraad kon niet worden opgeslagen.');}
 }
 else if(action==='receipt'){const sale=sales().find(s=>s.id===pid);if(sale)receipt(sale);}
 else if(action==='close-receipt')$('rfReceiptOverlay')?.remove();
 else if(action==='print')window.print();
 else if(action==='export')csv();
 else if(action==='backup')backup();
 },true);
 document.addEventListener('submit',e=>{
 if(e.target.id!=='rfProductForm')return;e.preventDefault();const f=new FormData(e.target),name=String(f.get('name')||'').trim(),sku=String(f.get('sku')||'').trim(),imei=String(f.get('imei')||'').trim(),price=Number(f.get('price')),cost=Number(f.get('cost')),stock=Number(f.get('stock')),vat=Number(f.get('vat')),ps=products();
 if(!name||!positive(price)||!positive(cost)||!stockInt(stock)||(imei&&stock>1)||![0,6,12,21].includes(vat)){notify('Controleer de productgegevens.');return;}
 if(sku&&ps.some(p=>p.sku===sku&&p.active!==false)){notify('Deze SKU bestaat al.');return;}
 if(imei&&ps.some(p=>p.imei&&String(p.imei).replace(/[\\s-]/g,'').toUpperCase()===imei.replace(/[\\s-]/g,'').toUpperCase()&&p.active!==false)){notify('Dit IMEI/serienummer bestaat al.');return;}
 if(imei){
  const refurb=read('rfRefurbV1',null),norm=v=>String(v||'').replace(/[\\s-]/g,'').toUpperCase();
  if(!Array.isArray(refurb)){notify('Refurbished-voorraad kan niet worden gecontroleerd. Controleer de gegevens voordat je dit toestel toevoegt.');return;}
  if(refurb.some(r=>r&&typeof r==='object'&&!['Verkocht','Afgekeurd','Onderdelen-donor'].includes(r.status)&&[r.imei,r.imei1,r.imei2,r.serial,r.serialNumber].some(v=>v&&norm(v)===norm(imei)))){
   notify('Dit IMEI/serienummer staat al bij een actief refurbished toestel. Beheer het via Refurbished.');return;
  }
 }
 ps.push({id:id(),name,sku,imei,price:round(price),cost:round(cost),stock,vat,active:true,createdAt:new Date().toISOString()});
 try{commitStock(ps,[movement(ps[ps.length-1],stock,'Beginvoorraad')]);render();notify('Product toegevoegd.');}catch{notify('Opslaan mislukt.');}
 },true);
 document.addEventListener('change',e=>{if(e.target.id==='rfSaleCustomer')selectedCustomer=e.target.value;},true);
 document.addEventListener('input',e=>{if(e.target.id==='rfProductSearch'){query=e.target.value;const start=e.target.selectionStart;renderSales();const input=$('rfProductSearch');input?.focus();input?.setSelectionRange(start,start);}},true);
 shell();render();
})();
