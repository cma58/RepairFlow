'use strict';
const $=id=>document.getElementById(id),state={customers:[],repairs:[],products:[],refurbished:[],sales:[],cashDays:[]};
let CART_KEY=null,PENDING_KEY=null,WRITES_KEY=null,contextScope=null,accessReady=false,loading=false;
const emptyState=()=>({customers:[],repairs:[],products:[],reservations:[],refurbished:[],sales:[],cashDays:[],cashDayPayments:[],dashboard:null,context:null});
let cart=[],pending=null,pendingWrites={},storageOk=true,busy=false;
const updates=typeof BroadcastChannel==='function'?new BroadcastChannel('rf-workspace-updates'):null;
function euro(c){return '€ '+(Number(c)/100).toFixed(2).replace('.',',')}
function toCents(value){const s=String(value).trim().replace(',','.');if(!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(s))throw Error('Gebruik een geldig bedrag met maximaal twee decimalen.');const [whole,fraction='']=s.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'))}
function info(message){$('message').textContent=message;$('error').textContent=''}
function error(message){$('error').textContent=message;$('message').textContent=''}
function updatePending(){ $('retry-pending').hidden=!pending&&!Object.keys(pendingWrites).length }
function saveDraft(key,value){if(!contextScope||!key)throw Error('Vernieuw eerst de geautoriseerde winkelgegevens.');if(!storageOk)throw Error('Beschadigde clouddraft: opslag is geblokkeerd.');localStorage.setItem(key,JSON.stringify(value))}
function textList(id,items,render){const list=$(id);list.replaceChildren();for(const item of items){const li=document.createElement('li');li.dataset.entityId=item.id||'';render(li,item);list.append(li)}if(!items.length){const li=document.createElement('li');li.className='empty';li.textContent='Nog geen gegevens in deze lijst.';list.append(li)}}
function option(select,id,name){const el=document.createElement('option');el.value=id;el.textContent=name;select.append(el)}
function fillSelect(id,items,name){const el=$(id),old=el.value;el.replaceChildren();option(el,'','Kies…');for(const item of items)option(el,item.id,name(item));el.value=items.some(i=>i.id===old)?old:''}
function button(label,click){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',click);return b}
function openModule(id){window.PhixarShell?.show(id)}
async function api(payload){const response=await fetch('/api/workspace',{method:payload?'POST':'GET',credentials:'same-origin',headers:payload?{'Content-Type':'application/json','Accept':'application/json',...PhixarContext.headers()}:{'Accept':'application/json',...PhixarContext.headers()},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
 const data=await response.json().catch(()=>({}));if(!response.ok){const messages={version_conflict:'Het dossier is door iemand anders gewijzigd. Vernieuw het dossier en controleer je invoer.',approval_required:'Klantakkoord is vereist voor deze werkzaamheden.',balance_due:'Het reparatiesaldo moet eerst volledig worden voldaan.',day_closed:'De kassadag is afgesloten. Een nieuwe ontvangst kan hier niet worden geboekt.',conflict:'De gegevens of status zijn gewijzigd. Vernieuw en controleer het dossier.',invalid_input:'Controleer de ingevulde gegevens en bedragen.',access_denied:'Je hebt geen toegang tot deze handeling.'};const e=Error(messages[data.error]||data.error||'Netwerk- of serverfout');e.status=response.status;throw e}return data}
function notifyState(status){document.dispatchEvent(new CustomEvent('phixar:state',{detail:{status,data:state,cart,pending,busy}}))}
function clearAccess(){accessReady=false;Object.assign(state,emptyState());cart=[];pending=null;pendingWrites={};contextScope=null;CART_KEY=PENDING_KEY=WRITES_KEY=null;document.querySelectorAll('form').forEach(f=>f.reset());window.PhixarRepairs?.clear();$('print-document').replaceChildren();$('print-document').hidden=true;$('print-button').hidden=true;$('receipt').textContent='';render();$('identity').textContent='Aanmelden vereist';updatePending()}
async function load({silent=false}={}){if(loading)return false;loading=true;try{const data=await api();const nextScope=PhixarContext.scope(data.context);
 if(contextScope!==nextScope){const wasLoaded=contextScope!==null;cart=[];pending=null;pendingWrites={};document.querySelectorAll('form').forEach(f=>f.reset());window.PhixarRepairs?.clear();$('print-document').replaceChildren();$('print-document').hidden=true;$('print-button').hidden=true;$('receipt').textContent='';storageOk=true;
  contextScope=nextScope;try{const restored=PhixarContext.restore(localStorage,data.context);CART_KEY=restored.keys.cart;PENDING_KEY=restored.keys.pending;WRITES_KEY=restored.keys.writes;cart=restored.cart;pending=restored.pending;pendingWrites=restored.writes}catch(e){storageOk=false;error(e.message)}
  if(wasLoaded)info('Andere winkelcontext geladen; vorige concepten blijven afzonderlijk bewaard.');
 }
 Object.assign(state,emptyState(),data);accessReady=true;render();updatePending();$('identity').textContent='Aangemeld als '+data.context.role+' · beveiligde cloudwerkruimte';notifyState('ready');if(!silent&&storageOk)info('Cloudgegevens vernieuwd.');return true
 }catch(e){accessReady=false;if(e.status===401||e.status===403){clearAccess();notifyState('unauthorized')}else notifyState(state.context?'stale':'unavailable');error('Cloudgegevens zijn niet geladen: '+e.message);return false}finally{loading=false}}

function render(){
 fillSelect('repair-customer',state.customers,c=>c.display_name);
 fillSelect('stock-product',state.products,p=>p.sku+' · '+p.name);
 fillSelect('stock-repair',state.repairs.filter(r=>['In reparatie','Wachten op klant'].includes(r.status)&&(Number(r.charge_cents)===0||r.quote_approved_at)),r=>r.reference);
 textList('customers',state.customers,(li,c)=>{li.append(document.createTextNode((c.company_name?c.company_name+' · ':'')+c.display_name+' · '+(c.phone||c.email||'geen contact')));li.append(button('Nieuwe reparatie',()=>{$('repair-customer').value=c.id;openModule('repairs')}))});
 textList('repairs',state.repairs,(li,r)=>{
  li.append(document.createTextNode(r.reference+' · '+(r.device_brand||'Merk niet ingevuld')+' '+(r.device_model||'')+' · '+r.status+' · totaal '+euro(r.charge_cents)+' · ontvangen '+euro(r.paid_cents||0)+' · saldo '+euro(Number(r.charge_cents)-Number(r.paid_cents||0))));
  li.append(button('Dossier',()=>window.PhixarRepairs?.open(r.id)),button('Document',()=>repairDocument(r.id)));
  const next={Binnengebracht:'Diagnose',Diagnose:Number(r.charge_cents)===0?'In reparatie':'Wachten op klant','Wachten op klant':r.quote_approved_at?'In reparatie':null,'Wachten op onderdeel':'In reparatie','In reparatie':'Kwaliteitscontrole',Kwaliteitscontrole:'Klaar',Klaar:'Afgehaald'}[r.status];
  if(next&&!r.open_quote_id)li.append(button(next==='Klaar'?'Test geslaagd':next,()=>runRepairCommand({repairId:r.id,expectedVersion:r.version,command:'status',status:next,...(next==='Klaar'?{testPassed:true}:{})})));
  if(['In reparatie','Wachten op klant'].includes(r.status)&&!r.open_quote_id&&!r.parts_finalized&&(Number(r.charge_cents)===0||r.quote_approved_at))li.append(button('Onderdeel reserveren',()=>{$('stock-operation').value='reserve';$('stock-repair').value=r.id;openModule('stock')}));
  if(r.status==='Klaar'&&Number(r.charge_cents)>Number(r.paid_cents||0))li.append(button('Naar kassa',()=>{if(pending){error('Controleer eerst de onzekere verkoopaanvraag.');return}if(!cart.some(l=>l.type==='repair'&&l.id===r.id)){const line={type:'repair',id:r.id,quantity:1,expectedVersion:r.version};cart.push(line);try{saveDraft(CART_KEY,cart)}catch(e){cart.pop();error(e.message);return}}renderCart();openModule('checkout');info('Reparatie staat in de gecombineerde winkelmand.')}));
 });
 textList('products',state.products,(li,p)=>li.textContent=p.sku+' · '+p.name+' · fysiek '+p.quantity+' · beschikbaar '+p.available+' · '+euro(p.unit_price_cents));
 textList('reservations',state.reservations||[],(li,r)=>{const product=state.products.find(p=>p.id===r.product_id),repair=state.repairs.find(p=>p.id===r.repair_id);li.textContent=(product?.name||r.product_id)+' · '+r.quantity+' voor '+(repair?.reference||r.repair_id)});
 textList('refurbished',state.refurbished,(li,r)=>{li.append(document.createTextNode(r.imei+' · '+r.description+' · '+r.status+' · '+euro(r.price_cents)));if(['inspection','rejected','available'].includes(r.status))for(const status of ['rejected','available'].filter(v=>v!==r.status))li.append(button(status==='rejected'?'Keur af':'Keur goed',()=>{const reason=prompt('Reden van de beoordeling:');if(reason)send({action:'assess',refurbishedId:r.id,expectedStatus:r.status,status,reason},'Beoordeling met historiek opgeslagen.')}))});
 textList('sales',state.sales,(li,s)=>{li.append(document.createTextNode(s.reference+' · '+euro(s.total_cents)+' · '));li.append(button('Bewijs',()=>receipt(s.id)))});
 textList('cash-days',state.cashDays,(li,d)=>{const methods=state.cashDayPayments?.filter(p=>String(p.business_date).slice(0,10)===String(d.business_date).slice(0,10)).map(p=>p.method+' '+euro(p.amount_cents)).join(' + ');li.append(document.createTextNode(String(d.business_date).slice(0,10)+' · geregistreerde ontvangsten '+euro(d.total_cents)+' · correcties '+euro(d.corrections_cents)+' · '+(methods||'geen betalingen')+' · gesloten'));li.append(button('Correctie',()=>{const reason=prompt('Reden voor correctie (minimaal 5 tekens):');if(!reason)return;const value=prompt('Correctiebedrag in euro (negatief of positief):');if(!value)return;try{const negative=value.trim().startsWith('-');const amount=toCents(negative?value.trim().slice(1):value);send({action:'correction',requestId:crypto.randomUUID(),dayId:d.id,deltaCents:negative?-amount:amount,reason},'Correctie toegevoegd.')}catch(e){error(e.message)}}))});
 updateCartPicker();renderCart();notifyState(accessReady?'ready':'loading');
}
function updateCartPicker(){const type=$('cart-type').value;const candidates=type==='product'?state.products.filter(x=>Number(x.available)>0&&x.active):type==='repair'?state.repairs.filter(x=>x.status==='Klaar'&&Number(x.charge_cents)>Number(x.paid_cents||0)):state.refurbished.filter(x=>x.status==='available');fillSelect('cart-item',candidates,x=>type==='product'?x.name+' · '+euro(x.unit_price_cents):type==='repair'?x.reference+' · '+euro(Number(x.charge_cents)-Number(x.paid_cents||0)):x.description+' · '+euro(x.price_cents))}
function renderCart(){textList('cart',cart,(li,l)=>{const x=(l.type==='product'?state.products:l.type==='repair'?state.repairs:state.refurbished).find(v=>v.id===l.id);li.append(document.createTextNode((x?.name||x?.reference||x?.description||l.id)+' × '+l.quantity+' · '+l.type));li.append(button('Verwijder',()=>{if(pending){error('Deze aanvraag wacht op bevestiging. Herhaal eerst met dezelfde aanvraagcode.');return}cart=cart.filter(v=>v!==l);try{saveDraft(CART_KEY,cart)}catch(e){error(e.message)}renderCart()}))});notifyState(accessReady?'ready':'loading')}
async function send(payload,success,onFailure){if(!accessReady){error('Vernieuw eerst de winkelgegevens en controleer je toegang.');return null}if(busy)return;const writeScope=contextScope;busy=true;try{const result=await api(payload);const refreshed=await load({silent:true});updates?.postMessage('changed');if(contextScope!==writeScope)return null;if(refreshed)info(success+(result.replayed?' Herhaalde aanvraag veilig herkend.':''));else error(success+' De vernieuwde gegevens konden nog niet worden geladen.');return result}catch(e){onFailure?.(e);if(e.status===401||e.status===403){clearAccess();notifyState('unauthorized')}error('Niet opgeslagen of niet bevestigd: '+e.message);return null}finally{busy=false}}
$('retry-pending').addEventListener('click',async()=>{
 if(pending){const result=await send(pending,'Verkoopaanvraag gecontroleerd.',e=>{if(e.status>=400&&e.status<500){pending=null;localStorage.removeItem(PENDING_KEY);updatePending()}});if(result){const id=result.sale?.id;pending=null;cart=[];localStorage.removeItem(PENDING_KEY);saveDraft(CART_KEY,cart);renderCart();updatePending();if(id)await receipt(id)}return}
 const action=Object.keys(pendingWrites)[0];if(!action)return;
 const result=await send(pendingWrites[action],'Eerdere aanvraag gecontroleerd.',e=>{if(e.status>=400&&e.status<500){delete pendingWrites[action];saveDraft(WRITES_KEY,pendingWrites);updatePending()}});
 if(result){delete pendingWrites[action];saveDraft(WRITES_KEY,pendingWrites);updatePending()}
});
async function runRepairCommand(input){
 if(!accessReady||!storageOk||busy)return null;
 if(pendingWrites.repairCommand){error('Een dossierwijziging is onzeker. Controleer eerst de eerdere aanvraag.');return null}
 const payload={action:'repairCommand',requestId:crypto.randomUUID(),...input};pendingWrites.repairCommand=payload;
 try{saveDraft(WRITES_KEY,pendingWrites);updatePending();const result=await send(payload,'Dossierwijziging opgeslagen.',e=>{if(e.status>=400&&e.status<500){delete pendingWrites.repairCommand;saveDraft(WRITES_KEY,pendingWrites);updatePending()}});if(result){delete pendingWrites.repairCommand;saveDraft(WRITES_KEY,pendingWrites);updatePending()}return result}catch(e){error(e.message);return null}
}
function formData(form){return Object.fromEntries(new FormData(form).entries())}
$('customer-type').addEventListener('change',()=>{const business=$('customer-type').value==='business';$('company').required=business;$('billing-address').required=business});
for(const action of ['customer','repair','product','stock','refurb'])$(action).addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,x=formData(form);try{
  let payload={action,requestId:crypto.randomUUID()};
  if(action==='customer')payload={...payload,type:x.type,name:x.name,email:x.email,phone:x.phone,company:x.company,vat:x.vat,billingAddress:x.billingAddress};
  if(action==='repair')payload={...payload,customerId:x.customerId,brand:x.brand,model:x.model,serial:x.serial,complaint:x.complaint,chargeCents:toCents(x.charge),imei1:x.imei1,imei2:x.imei2,diagnosisFeeCents:toCents(x.diagnosisFee)};
  if(action==='product')payload={...payload,sku:x.sku,name:x.name,kind:x.kind,priceCents:toCents(x.price)};
  if(action==='stock')payload={...payload,productId:x.productId,quantity:Number(x.quantity),operation:x.operation,repairId:x.operation==='reserve'?x.repairId:undefined,...(x.operation==='reserve'?{expectedVersion:state.repairs.find(r=>r.id===x.repairId)?.version}:{})};
  if(action==='refurb')payload={...payload,imei:x.imei,description:x.description,priceCents:toCents(x.price)};
  if(pendingWrites[action])payload=pendingWrites[action];else{pendingWrites[action]=payload;saveDraft(WRITES_KEY,pendingWrites);updatePending()}
  const result=await send(payload,'Registratie opgeslagen.',e=>{if(e.status>=400&&e.status<500){delete pendingWrites[action];saveDraft(WRITES_KEY,pendingWrites)}});
  if(result){delete pendingWrites[action];saveDraft(WRITES_KEY,pendingWrites);updatePending();form.reset();if(action==='customer'){$('customer-type').dispatchEvent(new Event('change'));$('repair-customer').value=result.customer?.id||'';openModule('repairs');info('Klant opgeslagen; registreer nu de reparatie.')}}
 }catch(e){error(e.message)}
});
$('cart-type').addEventListener('change',updateCartPicker);
$('add-cart').addEventListener('click',()=>{if(!accessReady||!storageOk){error('Winkelconcepten of toegang zijn niet beschikbaar.');return}if(pending){error('Herhaal of controleer eerst de vorige betaling.');return}const type=$('cart-type').value,id=$('cart-item').value,quantity=Number($('cart-qty').value);if(!id||!Number.isSafeInteger(quantity)||quantity<1||quantity>999){error('Kies een geldig item en aantal.');return}if(cart.some(l=>l.id===id&&l.type===type)){error('Dit item staat al in de winkelmand.');return}cart.push({type,id,quantity:type==='product'?quantity:1,...(type==='repair'?{expectedVersion:state.repairs.find(r=>r.id===id)?.version}:{})});try{saveDraft(CART_KEY,cart);renderCart();info('Item toegevoegd.')}catch(e){cart.pop();error(e.message)}});
$('clear-cart').addEventListener('click',()=>{if(pending){error('Een betaling met deze aanvraagcode wacht op controle; de winkelmand blijft behouden.');return}cart=[];try{saveDraft(CART_KEY,cart);renderCart()}catch(e){error(e.message)}});
$('checkout').addEventListener('click',async()=>{if(!accessReady||!storageOk||busy||!cart.length)return;try{
  const payments=[['cash','pay-cash'],['card','pay-card'],['transfer','pay-transfer']].map(([method,id])=>({method,amountCents:toCents($(id).value),reference:method==='card'?$('card-ref').value:undefined,received:method==='transfer'})).filter(p=>p.amountCents>0);
  const payload={action:'checkout',requestId:pending?.requestId||crypto.randomUUID(),lines:cart,payments};
  if(pending&&JSON.stringify(pending.lines)!==JSON.stringify(cart)){error('Vorige betalingsaanvraag verschilt van de huidige winkelmand.');return}
  if(pending){payload.payments=pending.payments}else{saveDraft(PENDING_KEY,payload);pending=payload;updatePending()}
  const result=await send(payload,'Verkoop geregistreerd.',e=>{if(e.status>=400&&e.status<500){pending=null;localStorage.removeItem(PENDING_KEY);updatePending()}});if(!result)return;
  const receiptId=result.sale?.id;cart=[];pending=null;localStorage.removeItem(PENDING_KEY);saveDraft(CART_KEY,cart);renderCart();updatePending();if(receiptId)await receipt(receiptId);
 }catch(e){error('Winkelmand en aanvraag blijven bewaard: '+e.message)}});
function printLine(root,label,value){if(value==null||value==='')return;const p=document.createElement('p'),strong=document.createElement('strong');strong.textContent=label+': ';p.append(strong,document.createTextNode(String(value)));root.append(p)}
function printHeader(title,data){const root=$('print-document');root.replaceChildren();root.hidden=false;const h=document.createElement('h1');h.textContent=title;root.append(h);printLine(root,'Bedrijf',data.organization?.name||'PHIXAR');printLine(root,'Vestiging',data.branch?.name);printLine(root,'Adres',data.branch?.address);return root}
function printNotice(root,notice){const p=document.createElement('p');p.className='print-notice';p.textContent=notice;root.append(p);$('print-button').hidden=false}
function printTable(root,headers,rows){const table=document.createElement('table'),head=document.createElement('tr');for(const text of headers){const th=document.createElement('th');th.textContent=text;head.append(th)}table.append(head);for(const values of rows){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=String(value??'');tr.append(td)}table.append(tr)}root.append(table)}
async function documentData(query){const response=await fetch('/api/workspace?'+query,{credentials:'same-origin',headers:PhixarContext.headers(),cache:'no-store'});if(!response.ok){if([401,403].includes(response.status)){clearAccess();notifyState('unauthorized')}throw Error('document niet beschikbaar')};return response.json()}
async function receipt(id){try{const data=await documentData('saleId='+encodeURIComponent(id));$('receipt').textContent='Bewijs '+data.sale.reference+' · '+data.lines.map(l=>l.description+' '+l.quantity+' × '+euro(l.unit_price_cents)).join(' · ')+' · totaal '+euro(data.sale.total_cents)+' · '+data.payments.map(p=>p.method+' '+euro(p.amount_cents)+' ('+p.payment_state+')').join(' + ')+' · '+data.notice;
 const root=printHeader('Verkoopoverzicht · geen btw-factuur',data);printLine(root,'Referentie',data.sale.reference);printLine(root,'Datum',PhixarContext.date(data.sale.sold_at));
 printTable(root,['Omschrijving','Aantal','Eenheidsprijs','Totaal'],data.lines.map(l=>[l.description,l.quantity,euro(l.unit_price_cents),euro(l.line_total_cents)]));printLine(root,'Totaal inclusief nog niet geclassificeerde btw',euro(data.sale.total_cents));
 printTable(root,['Betaalwijze','Bedrag','Status'],data.payments.map(p=>[p.method,euro(p.amount_cents),p.payment_state]));printNotice(root,data.notice);
 }catch(e){error(e.message)}}
async function repairDocument(id){try{const data=await documentData('repairId='+encodeURIComponent(id)),r=data.repair,c=data.customer;const root=printHeader('Reparatieoverzicht · geen btw-factuur',data);
 printLine(root,'Referentie',r.reference);printLine(root,'Intake',PhixarContext.date(r.created_at));printLine(root,'Klant',c?.display_name);printLine(root,'Bedrijf klant',c?.company_name);printLine(root,'BTW-nummer klant (opgave)',c?.vat_number);printLine(root,'Contact',c?.phone||c?.email);printLine(root,'Toestel',(r.device_brand||'Merk niet ingevuld')+' '+(r.device_model||''));printLine(root,'IMEI1',r.imei1);printLine(root,'IMEI2',r.imei2);printLine(root,'Serienummer',r.device_serial);printLine(root,'Diagnoseprijs (gratis bij herstel)',euro(r.diagnosis_fee_cents||0));printLine(root,'Ontvangen',euro(data.paidCents||0));printLine(root,'Resterend saldo',euro(data.balanceCents||0));printLine(root,'Klacht',r.complaint);printLine(root,'Status',r.status);printLine(root,'Afgesproken bedrag',euro(r.charge_cents));
 if(r.quote_approved_at){printLine(root,'Akkoord vastgelegd op',PhixarContext.date(r.quote_approved_at));printLine(root,'Akkoordkanaal',r.quote_approval_method);printLine(root,'Medewerkersnotitie',r.quote_approval_note)}
 printTable(root,['Datum','Soort','Bedrag','Methode','Status'],(data.payments||[]).map(p=>[PhixarContext.date(p.recorded_at),p.kind,euro(p.amount_cents),p.method,'Administratief geregistreerd']));
 printTable(root,['Verkoop','Datum','Betaald deel'],(data.checkoutPayments||[]).map(p=>[p.reference,PhixarContext.date(p.sold_at),euro(p.line_total_cents)]));
 printTable(root,['Offerte','Totaal','Besluit','Werkzaamheden'],(data.quotes||[]).map(q=>[q.kind,euro(q.proposed_total_cents),q.decision||'In afwachting',q.scope]));
 printTable(root,['Datum','Van','Naar'],data.events.map(e=>[PhixarContext.date(e.created_at),e.from_status||'—',e.to_status]));printNotice(root,data.notice);info('Reparatiedocument klaar voor afdrukken.');
 }catch(e){error(e.message)}}
$('print-button').addEventListener('click',()=>window.print());
$('close-day').addEventListener('click',()=>send({action:'closeDay'},'Kassadag gesloten.'));
$('refresh').addEventListener('click',load);
updates?.addEventListener('message',()=>{if(document.visibilityState==='visible'&&!busy)load({silent:true})});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!busy)load({silent:true})});
setInterval(()=>{if(document.visibilityState==='visible'&&!busy)load({silent:true})},15000);
// Legacy unscoped rfCloud*V1 drafts stay untouched; never replay in a new tenant.
window.PhixarWorkspace={
 repairCommand:runRepairCommand,document:documentData,
 switchContext(value){if(busy||loading||pending||Object.keys(pendingWrites).length)throw Error('Controleer eerst de openstaande betaling of dossierwijziging.');clearAccess();PhixarContext.choose(value);window.location.reload()},
 select(group,item){if(!accessReady||!['customers','repairs','products','refurbished'].includes(group))return;const items=state[group];if(!items.some(x=>x.id===item.id))items.push(item);render();openModule({products:'stock',customers:'customers',repairs:'repairs',refurbished:'refurbished'}[group]);document.querySelector(`[data-entity-id="${item.id}"]`)?.scrollIntoView({block:'center',behavior:'smooth'})},
 add(type,id){if(!accessReady||pending)return;const select=$('cart-type');select.value=type;updateCartPicker();$('cart-item').value=id;$('cart-qty').value='1';$('add-cart').click()},
 get data(){return state}
};
notifyState('loading');load();
