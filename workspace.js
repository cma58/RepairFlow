'use strict';
const $=id=>document.getElementById(id),state={customers:[],repairs:[],products:[],refurbished:[],sales:[],cashDays:[]};
const CART_KEY='rfCloudCartDraftV1',PENDING_KEY='rfCloudPendingV1';
let cart=[],pending=null,storageOk=true,busy=false;
function euro(c){return '€ '+(Number(c)/100).toFixed(2).replace('.',',')}
function toCents(value){const s=String(value).trim().replace(',','.');if(!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(s))throw Error('Gebruik een geldig bedrag met maximaal twee decimalen.');const [whole,fraction='']=s.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'))}
function info(message){$('message').textContent=message;$('error').textContent=''}
function error(message){$('error').textContent=message;$('message').textContent=''}
function readDraft(key,fallback){const raw=localStorage.getItem(key);if(raw===null)return fallback;try{const value=JSON.parse(raw);if(!Array.isArray(value)&&(!value||typeof value!=='object'))throw Error();return value}catch{storageOk=false;error('Beschadigde clouddraft aangetroffen. De oorspronkelijke browsergegevens blijven intact; er wordt niets overschreven.');return fallback}}
function saveDraft(key,value){if(!storageOk)throw Error('Beschadigde clouddraft: opslag is geblokkeerd.');localStorage.setItem(key,JSON.stringify(value))}
function textList(id,items,render){const list=$(id);list.replaceChildren();for(const item of items){const li=document.createElement('li');render(li,item);list.append(li)}}
function option(select,id,name){const el=document.createElement('option');el.value=id;el.textContent=name;select.append(el)}
function fillSelect(id,items,name){const el=$(id),old=el.value;el.replaceChildren();option(el,'','Kies…');for(const item of items)option(el,item.id,name(item));el.value=items.some(i=>i.id===old)?old:''}
function button(label,click){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',click);return b}
async function api(payload){const response=await fetch('/api/workspace',{method:payload?'POST':'GET',credentials:'same-origin',headers:payload?{'Content-Type':'application/json','Accept':'application/json'}:{'Accept':'application/json'},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Netwerk- of serverfout');return data}
async function load(){try{const data=await api();Object.assign(state,data);render();info('Cloudgegevens vernieuwd.')}catch(e){error('Cloudgegevens zijn niet geladen: '+e.message)}}
function render(){
 fillSelect('repair-customer',state.customers,c=>c.display_name);
 fillSelect('stock-product',state.products,p=>p.sku+' · '+p.name);
 fillSelect('stock-repair',state.repairs.filter(r=>['In reparatie','Kwaliteitscontrole'].includes(r.status)),r=>r.reference);
 textList('customers',state.customers,(li,c)=>li.textContent=c.display_name+' · '+(c.phone||c.email||'geen contact'));
 textList('repairs',state.repairs,(li,r)=>{
  li.append(document.createTextNode(r.reference+' · '+r.device_brand+' '+(r.device_model||'')+' · '+r.status+' · '+euro(r.charge_cents)));
  const next={Binnengebracht:['Diagnose'],Diagnose:['Wachten op klant','In reparatie'], 'Wachten op klant':['In reparatie'],'Wachten op onderdeel':['In reparatie'],'In reparatie':['Kwaliteitscontrole'],Kwaliteitscontrole:['Klaar','In reparatie'],Klaar:['Afgehaald']}[r.status]||[];
  for(const status of next)li.append(button(status,()=>send({action:'changeRepair',repairId:r.id,expectedStatus:r.status,status},'Reparatiestatus opgeslagen.')));
 });
 textList('products',state.products,(li,p)=>li.textContent=p.sku+' · '+p.name+' · '+p.quantity+' stuks · '+euro(p.unit_price_cents));
 textList('refurbished',state.refurbished,(li,r)=>{li.append(document.createTextNode(r.imei+' · '+r.description+' · '+r.status+' · '+euro(r.price_cents)));if(['inspection','rejected','available'].includes(r.status))for(const status of ['rejected','available'].filter(v=>v!==r.status))li.append(button(status==='rejected'?'Keur af':'Keur goed',()=>{const reason=prompt('Reden van de beoordeling:');if(reason)send({action:'assess',refurbishedId:r.id,expectedStatus:r.status,status,reason},'Beoordeling met historiek opgeslagen.')}))});
 textList('sales',state.sales,(li,s)=>{li.append(document.createTextNode(s.reference+' · '+euro(s.total_cents)+' · '));li.append(button('Bewijs',()=>receipt(s.id)))});
 textList('cash-days',state.cashDays,(li,d)=>{li.append(document.createTextNode(String(d.business_date).slice(0,10)+' · '+euro(d.total_cents)+' · gesloten'));li.append(button('Correctie',()=>{const reason=prompt('Reden voor correctie (minimaal 5 tekens):');if(!reason)return;const value=prompt('Correctiebedrag in euro (negatief of positief):');if(!value)return;try{const negative=value.trim().startsWith('-');const amount=toCents(negative?value.trim().slice(1):value);send({action:'correction',requestId:crypto.randomUUID(),dayId:d.id,deltaCents:negative?-amount:amount,reason},'Correctie toegevoegd.')}catch(e){error(e.message)}}))});
 updateCartPicker();renderCart();
}
function updateCartPicker(){const type=$('cart-type').value;const candidates=type==='product'?state.products.filter(x=>x.quantity>0&&x.active):type==='repair'?state.repairs.filter(x=>x.status==='Klaar'&&Number(x.charge_cents)>0):state.refurbished.filter(x=>x.status==='available');fillSelect('cart-item',candidates,x=>type==='product'?x.name+' · '+euro(x.unit_price_cents):type==='repair'?x.reference+' · '+euro(x.charge_cents):x.description+' · '+euro(x.price_cents))}
function renderCart(){textList('cart',cart,(li,l)=>{const x=(l.type==='product'?state.products:l.type==='repair'?state.repairs:state.refurbished).find(v=>v.id===l.id);li.append(document.createTextNode((x?.name||x?.reference||x?.description||l.id)+' × '+l.quantity+' · '+l.type));li.append(button('Verwijder',()=>{if(pending){error('Deze aanvraag wacht op bevestiging. Herhaal eerst met dezelfde aanvraagcode.');return}cart=cart.filter(v=>v!==l);try{saveDraft(CART_KEY,cart)}catch(e){error(e.message)}renderCart()}))})}
async function send(payload,success){if(busy)return;busy=true;try{const result=await api(payload);info(success+(result.replayed?' Herhaalde aanvraag veilig herkend.':''));await load();return result}catch(e){error('Niet opgeslagen of niet bevestigd: '+e.message);return null}finally{busy=false}}
function formData(form){return Object.fromEntries(new FormData(form).entries())}
for(const action of ['customer','repair','product','stock','refurb'])$(action).addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,x=formData(form);try{
  let payload={action,requestId:crypto.randomUUID()};
  if(action==='customer')payload={...payload,name:x.name,email:x.email,phone:x.phone};
  if(action==='repair')payload={...payload,customerId:x.customerId,brand:x.brand,model:x.model,serial:x.serial,complaint:x.complaint,chargeCents:toCents(x.charge)};
  if(action==='product')payload={...payload,sku:x.sku,name:x.name,kind:x.kind,priceCents:toCents(x.price)};
  if(action==='stock')payload={...payload,productId:x.productId,quantity:Number(x.quantity),operation:x.operation,repairId:x.operation==='consume'?x.repairId:undefined};
  if(action==='refurb')payload={...payload,imei:x.imei,description:x.description,priceCents:toCents(x.price)};
  const result=await send(payload,'Registratie opgeslagen.');if(result)form.reset();
 }catch(e){error(e.message)}
});
$('cart-type').addEventListener('change',updateCartPicker);
$('add-cart').addEventListener('click',()=>{if(pending){error('Herhaal of controleer eerst de vorige betaling.');return}const type=$('cart-type').value,id=$('cart-item').value,quantity=Number($('cart-qty').value);if(!id||!Number.isSafeInteger(quantity)||quantity<1||quantity>999){error('Kies een geldig item en aantal.');return}if(cart.some(l=>l.id===id&&l.type===type)){error('Dit item staat al in de winkelmand.');return}cart.push({type,id,quantity:type==='product'?quantity:1});try{saveDraft(CART_KEY,cart);renderCart();info('Item toegevoegd.')}catch(e){cart.pop();error(e.message)}});
$('clear-cart').addEventListener('click',()=>{if(pending){error('Een betaling met deze aanvraagcode wacht op controle; de winkelmand blijft behouden.');return}cart=[];try{saveDraft(CART_KEY,cart);renderCart()}catch(e){error(e.message)}});
$('checkout').addEventListener('click',async()=>{if(busy||!cart.length)return;try{
  const payments=[['cash','pay-cash'],['card','pay-card'],['transfer','pay-transfer']].map(([method,id])=>({method,amountCents:toCents($(id).value),reference:method==='card'?$('card-ref').value:undefined,received:method==='transfer'})).filter(p=>p.amountCents>0);
  const payload={action:'checkout',requestId:pending?.requestId||crypto.randomUUID(),lines:cart,payments};
  if(pending&&JSON.stringify(pending.lines)!==JSON.stringify(cart)){error('Vorige betalingsaanvraag verschilt van de huidige winkelmand.');return}
  if(pending){payload.payments=pending.payments}else{saveDraft(PENDING_KEY,payload);pending=payload}
  const result=await send(payload,'Verkoop geregistreerd.');if(!result)return;
  const receiptId=result.sale?.id;cart=[];pending=null;localStorage.removeItem(PENDING_KEY);saveDraft(CART_KEY,cart);renderCart();if(receiptId)await receipt(receiptId);
 }catch(e){error('Winkelmand en aanvraag blijven bewaard: '+e.message)}});
async function receipt(id){try{const response=await fetch('/api/workspace?saleId='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('bewijs niet beschikbaar');const data=await response.json();$('receipt').textContent='Bewijs '+data.sale.reference+' · '+data.lines.map(l=>l.description+' '+l.quantity+' × '+euro(l.unit_price_cents)).join(' · ')+' · totaal '+euro(data.sale.total_cents)+' · '+data.payments.map(p=>p.method+' '+euro(p.amount_cents)+' ('+p.payment_state+')').join(' + ')+' · '+data.notice}catch(e){error(e.message)}}
$('close-day').addEventListener('click',()=>send({action:'closeDay'},'Kassadag gesloten.'));
$('refresh').addEventListener('click',load);
try{const draft=readDraft(CART_KEY,[]);if(!Array.isArray(draft))throw Error('ongeldig winkelmandje');cart=draft;pending=readDraft(PENDING_KEY,null);if(pending)info('Een eerdere verkoopaanvraag is onzeker. Klik opnieuw op Registreer betaling en verkoop met dezelfde aanvraagcode.')}catch{storageOk=false;error('Beschadigde browserdraft. Niets wordt overschreven.')}
fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('geen medewerkersrechten'))).then(me=>{$('identity').textContent='Aangemeld als '+me.role+' · geïsoleerde cloudtest';return load()}).catch(e=>error('Geen toegang: '+e.message));
