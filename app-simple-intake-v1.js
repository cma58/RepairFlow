'use strict';
/* RepairFlow — eenvoudige intake, eerste module van de beginnersvriendelijke herwerking.
   De bestaande intakevalidatie en opslag blijven behouden. */
(()=>{
 const get=id=>document.getElementById(id);
 let active=0,root=null,steps=[];
 const css=document.createElement('style');
 css.textContent=`
 #rf-simple-intake{margin-bottom:16px;color:#111827}
 #rf-simple-intake .rf-stepbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 20px}
 #rf-simple-intake .rf-step{flex:1;min-width:90px;padding:12px;border-radius:12px;background:#eef2f7;color:#334155;text-align:center;font-weight:800}
 #rf-simple-intake .rf-step.active{background:#dbeafe;color:#1d4ed8}
 #rf-simple-intake .rf-step.done{background:#dcfce7;color:#166534}
 #rf-simple-intake .rf-help{font-size:15px;color:#475569;margin:8px 0 14px}
 #rf-simple-intake .rf-controls{display:flex;justify-content:space-between;gap:10px;margin:20px 0}
 #rf-simple-intake .rf-controls button{min-height:48px;min-width:110px}
 #rf-simple-intake .rf-error{color:#991b1b;font-weight:700;margin:8px 0}
 #oc.rf-intake-wizard .rf-intake-group[hidden]{display:none!important}
 #oc.rf-intake-wizard .rf-intake-group label{font-size:14px;color:#334155}
 #oc.rf-intake-wizard .rf-intake-group input,#oc.rf-intake-wizard .rf-intake-group textarea,#oc.rf-intake-wizard .rf-intake-group select{min-height:44px}
 `;
 document.head.appendChild(css);
 const title=['Wie brengt het toestel?','Welk toestel en wat is er mis?','Controleer en bevestig'];
 const help=['Vul de naam in. Een telefoonnummer of e-mail helpt om de klant te bereiken.','Vertel welk toestel het is en wat het probleem is.','Controleer alles en bevestig de probleemomschrijving.'];
 const fields=[['vat','company','nm','ph','em'],['kt','dv','sr','pr'],['cf']];
 function groupElements(el){
  const found=[];
  const previous=el.previousElementSibling;
  if(previous&&previous.tagName==='LABEL')found.push(previous);
  found.push(el);
  return found;
 }
 function init(){
  const host=get('oc');
  if(!host||!get('nm')||!get('dv')||!get('pr')||!get('cf'))return;
  if(host.dataset.rfWizard==='yes')return;
  host.dataset.rfWizard='yes';host.classList.add('rf-intake-wizard');
  const form=host.querySelector('.oc');if(!form)return;
  active=0;root=host;steps=[];
  const intro=document.createElement('div');intro.id='rf-simple-intake';
  intro.innerHTML='<h2 style="margin:0">Nieuwe reparatie</h2><div class="rf-stepbar"></div><p class="rf-help"></p><p class="rf-error" aria-live="polite"></p>';
  form.prepend(intro);
  for(let i=0;i<3;i++){const wrap=document.createElement('div');wrap.className='rf-intake-group';wrap.dataset.step=String(i);form.appendChild(wrap);steps.push(wrap)}
  // Move complete field groups without changing input IDs or their handlers.
  for(let i=0;i<fields.length;i++)for(const id of fields[i]){
    const el=get(id);if(!el||!form.contains(el))continue;
    if(id==='vat'){const row=el.closest('.row');if(row){const label=row.previousElementSibling;if(label?.tagName==='LABEL')steps[i].appendChild(label);steps[i].appendChild(row);continue}}
    if(id==='company'){steps[i].appendChild(el);continue}
    if(id==='cf'){const label=el.closest('label');if(label){steps[i].appendChild(label);continue}}
    for(const n of groupElements(el))if(n.parentNode)steps[i].appendChild(n);
  }
  const submit=form.querySelector('[data-action="submit"]');
  if(submit){steps[2].appendChild(submit);submit.textContent='✓ Reparatie aanmelden';submit.style.minHeight='50px'}
  const controls=document.createElement('div');controls.className='rf-controls';
  controls.innerHTML='<button type="button" class="btn s" id="rf-intake-back">← Vorige</button><button type="button" class="btn g" id="rf-intake-next">Verder →</button>';
  form.appendChild(controls);
  get('rf-intake-back').addEventListener('click',()=>show(active-1));
  get('rf-intake-next').addEventListener('click',()=>{if(validate())show(active+1)});
  show(0);
 }
 function validate(){
  const error=root?.querySelector('.rf-error');if(error)error.textContent='';
  if(active===0){
   if(!get('nm')?.value.trim()){if(error)error.textContent='Vul eerst de naam in.';get('nm')?.focus();return false}
   if(get('vat')&&!get('vat').value.trim()){if(error)error.textContent='Vul het ondernemingsnummer in.';get('vat')?.focus();return false}
  }
  if(active===1){
   if(!get('dv')?.value.trim()){if(error)error.textContent='Welk toestel is het?';get('dv')?.focus();return false}
   if(!get('pr')?.value.trim()){if(error)error.textContent='Wat is er mis met het toestel?';get('pr')?.focus();return false}
  }
  return true;
 }
 function show(n){
  active=Math.max(0,Math.min(2,n));
  const intro=get('rf-simple-intake');if(!intro)return;
  intro.querySelector('.rf-stepbar').innerHTML=title.map((t,i)=>`<div class="rf-step ${i===active?'active':i<active?'done':''}">${i+1}. ${t}</div>`).join('');
  intro.querySelector('.rf-help').textContent=help[active];
  intro.querySelector('.rf-error').textContent='';
  steps.forEach((el,i)=>el.hidden=i!==active);
  get('rf-intake-back').hidden=active===0;
  get('rf-intake-next').hidden=active===2;
  if(active===2){
   let summary=get('rf-intake-summary');
   if(!summary){summary=document.createElement('div');summary.id='rf-intake-summary';summary.style.cssText='background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px;margin-bottom:12px';steps[2].prepend(summary)}
   const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   summary.innerHTML=`<b>Dit gaan we registreren:</b><p><b>Klant:</b> ${escape(get('nm')?.value)}<br><b>Toestel:</b> ${escape(get('dv')?.value)}<br><b>Probleem:</b> ${escape(get('pr')?.value)}</p>`;
  }
 }
 const observer=new MutationObserver(()=>{if(get('nm')&&get('dv')&&get('pr')&&get('cf')&&get('oc')?.dataset.rfWizard!=='yes')init()});
 observer.observe(document.body,{childList:true,subtree:true});
 init();
})();