'use strict';
/* RepairFlow Klanten V2.1 — contrast + CRM quality hardening */
(() => {
  const KEY='rfCustomersV1';
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{};}catch(e){return {};}};
  const store=s=>localStorage.setItem(KEY,JSON.stringify(s));
  const iso=()=>new Date().toISOString();
  const uid=p=>p+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  const pname=c=>c?.type==='Bedrijf'?(c.companyName||c.name):c?.name;
  const pnorm=v=>{let x=String(v||'').replace(/\D/g,'');if(x.startsWith('0032'))x='0'+x.slice(4);else if(x.startsWith('32')&&x.length>=10)x='0'+x.slice(2);return x;};
  const audit=(c,action,oldValue='',newValue='')=>{c.audit=Array.isArray(c.audit)?c.audit:[];c.audit.unshift({id:uid('CAUD'),at:iso(),actor:'Amine',action,oldValue:String(oldValue||''),newValue:String(newValue||'')});};
  const cRepairs=id=>Object.entries(repairs).filter(([,r])=>r.customerId===id);
  const cOpen=id=>cRepairs(id).reduce((s,[,r])=>s+due(r),0);

  // 1) Global readable contrast for light overlays, including Track & Trace.
  const style=document.createElement('style');
  style.textContent=`
    .overlay .demo-card{background:#fff;color:#111827;border-color:#d9e1ec}
    .overlay .demo-card .muted,.overlay .demo-card .small.muted{color:#5f6b7a}
    .overlay .badge{background:#e7eef9;color:#1f3a5f}
    .overlay .ticket,.overlay .clickable{color:#245ea8}
    .overlay .btn.s{background:#edf2f8;color:#172033;border-color:#cfd8e6}
    .overlay .btn.s:hover{background:#e3ebf5}
    .overlay .demo-card input,.overlay .demo-card select,.overlay .demo-card textarea{background:#fff;color:#111827}
  `;
  document.head.appendChild(style);

  // Helpers to infer the currently opened customer from V2 DOM.
  const currentCustomerId=()=>document.querySelector('[data-c2="archive"][data-id]')?.dataset.id || document.querySelector('[data-c2="repair"][data-id]')?.dataset.id || '';

  function renderCommunicationTab(id){
    const h=document.getElementById('c2tab'),s=load(),c=s[id];if(!h||!c)return;
    const ev=[];
    (c.communications||[]).forEach(x=>ev.push({...x,kind:'Communicatie'}));
    (c.notes||[]).forEach(x=>ev.push({...x,kind:x.type||'Notitie'}));
    ev.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
    h.innerHTML=`<div class="row space wrap"><div><h3 style="margin:0">Communicatie & notities</h3><div class="muted">Telefoon, e-mail, baliecontact en interne operationele notities.</div></div><button class="btn g" data-c21="communication-new" data-id="${esc(id)}">+ Registreren</button></div>${ev.map(x=>`<div class="demo-card" style="margin:8px 0"><b>${esc(x.kind)}${x.channel?' · '+esc(x.channel):''}</b><br>${esc(x.text||'')}<br><span class="small muted">${esc(x.at||'')} · ${esc(x.actor||'Amine')}</span></div>`).join('')||'<div class="demo-card" style="margin-top:12px">Nog geen communicatie geregistreerd.</div>'}`;
  }

  function addQualityUi(){
    // Restore dedicated Communications tab in V2.
    const tabHost=document.querySelector('#c2workspace .card > div[style*="overflow:auto"]');
    const id=currentCustomerId();
    if(tabHost&&id&&!tabHost.querySelector('[data-c21="communications-tab"]')){
      const b=document.createElement('button');b.className='btn s';b.dataset.c21='communications-tab';b.dataset.id=id;b.textContent='Communicatie';tabHost.appendChild(b);
    }
    // Restore language + billing email management lost between V1 and V2.
    if(id&&document.getElementById('c2eType')&&!document.querySelector('[data-c21="extra-contact"]')){
      const host=document.getElementById('c2tab');
      if(host){const b=document.createElement('button');b.className='btn s';b.dataset.c21='extra-contact';b.dataset.id=id;b.style.marginTop='12px';b.textContent='Taal & facturatiegegevens';host.appendChild(b);}
    }
    // Add reverse merge option so operator chooses the master record.
    document.querySelectorAll('[data-c2="merge-preview"][data-keep][data-drop]').forEach(b=>{
      const parent=b.parentElement;if(!parent||parent.querySelector('[data-c21="merge-reverse"]'))return;
      const r=document.createElement('button');r.className='btn s';r.dataset.c21='merge-reverse';r.dataset.keep=b.dataset.drop;r.dataset.drop=b.dataset.keep;r.style.marginLeft='6px';r.textContent='Andere record behouden';parent.appendChild(r);
    });
  }
  const mo=new MutationObserver(addQualityUi);mo.observe(document.body,{childList:true,subtree:true});addQualityUi();

  // Normalize phone searches so 0470..., +32 470... and 0032 470... all find the stored customer.
  window.addEventListener('input',e=>{
    if(e.target?.id!=='c2q')return;
    const raw=e.target.value;
    if(!/[0-9]/.test(raw)||/[a-zA-Z@]/.test(raw))return;
    const q=pnorm(raw);if(q.length<7)return;
    const hit=Object.values(load()).find(c=>c.phone&&pnorm(c.phone).includes(q));
    if(hit)e.target.value=hit.phone;
  },true);

  // Intercept archive: do not hide a customer with operational/financial work still open.
  window.addEventListener('click',e=>{
    const a=e.target.closest('[data-c2="archive"][data-id]');if(!a)return;
    const s=load(),c=s[a.dataset.id];if(!c||c.archived)return;
    const active=cRepairs(c.id).filter(([,r])=>!['Afgehaald','Geannuleerd'].includes(r.status));
    const open=cOpen(c.id);
    if(active.length||open>0){e.preventDefault();e.stopImmediatePropagation();toast(`Klant kan niet worden gearchiveerd: ${active.length} actieve reparatie(s) en ${euro(open)} open saldo.`);}
  },true);

  // Intercept ownership transfer. Historical repairs stay with the historical owner.
  window.addEventListener('click',e=>{
    const a=e.target.closest('[data-c2="device-transfer-confirm"][data-id][data-device]');if(!a)return;
    const select=document.getElementById('c2transfer');if(!select)return;
    e.preventDefault();e.stopImmediatePropagation();
    const s=load(),from=s[a.dataset.id],to=s[select.value];if(!from||!to)return;
    const idx=(from.devices||[]).findIndex(d=>d.id===a.dataset.device);if(idx<0)return;
    const d=from.devices[idx];
    const histId=d.id+'-HIST-'+Date.now().toString(36).toUpperCase();
    const historical={...d,id:histId,archived:true,ownershipEndedAt:iso(),historicalOwner:true};
    from.devices.splice(idx,1,historical);
    d.ownershipHistory=Array.isArray(d.ownershipHistory)?d.ownershipHistory:[];
    d.ownershipHistory.push({customerId:from.id,from:d.createdIso||'',to:iso()});
    d.createdIso=iso();d.archived=false;
    to.devices=Array.isArray(to.devices)?to.devices:[];to.devices.push(d);
    Object.values(repairs).forEach(r=>{if(r.customerId===from.id&&r.deviceId===a.dataset.device)r.deviceId=histId;});
    audit(from,'Toestel eigendom beëindigd',d.brandModel,to.id);
    audit(to,'Toestel overgenomen',from.id,d.brandModel);
    store(s);save();closeOverlay();go('customers');toast('Toestel verplaatst; historische reparaties blijven bij de vorige eigenaar.');
  },true);

  document.addEventListener('click',e=>{
    const a=e.target.closest('[data-c21]');if(!a)return;
    e.preventDefault();e.stopImmediatePropagation();
    const x=a.dataset.c21,id=a.dataset.id,s=load(),c=s[id];
    if(x==='communications-tab'){renderCommunicationTab(id);document.querySelectorAll('#c2workspace [data-c2="tab"],#c2workspace [data-c21="communications-tab"]').forEach(b=>{b.classList.remove('g');b.classList.add('s');});a.classList.remove('s');a.classList.add('g');}
    else if(x==='communication-new'){
      overlay('Klantcontact registreren',`<div class="oc"><label>Soort</label><select id="c21kind"><option>Communicatie</option><option>Operationele notitie</option><option>Interne waarschuwing</option></select><label>Kanaal</label><select id="c21channel"><option>Telefoon</option><option>E-mail</option><option>Balie</option><option>Klantportaal</option><option>Intern</option></select><label>Tekst *</label><textarea id="c21text"></textarea><button class="btn g" data-c21="communication-save" data-id="${esc(id)}">Opslaan</button></div>`);
    }
    else if(x==='communication-save'){
      if(!c)return;const text=document.getElementById('c21text')?.value.trim()||'';if(!text){toast('Tekst is verplicht.');return;}
      const kind=document.getElementById('c21kind').value,channel=document.getElementById('c21channel').value,entry={id:uid(kind==='Communicatie'?'COM':'NOTE'),at:iso(),actor:'Amine',text};
      if(kind==='Communicatie'){c.communications=Array.isArray(c.communications)?c.communications:[];c.communications.unshift({...entry,channel});}
      else {c.notes=Array.isArray(c.notes)?c.notes:[];c.notes.unshift({...entry,type:kind});}
      audit(c,kind+' toegevoegd','',text);store(s);closeOverlay();go('customers');
    }
    else if(x==='extra-contact'){
      if(!c)return;overlay('Taal & facturatiegegevens',`<div class="oc"><label>Taalvoorkeur</label><select id="c21lang">${['Nederlands','Frans','Engels'].map(v=>`<option ${v===(c.language||'Nederlands')?'selected':''}>${v}</option>`).join('')}</select><label>Facturatie-e-mail</label><input id="c21billing" value="${esc(c.billingEmail||c.email||'')}"><button class="btn g" data-c21="extra-contact-save" data-id="${esc(id)}">Opslaan</button></div>`);
    }
    else if(x==='extra-contact-save'){
      if(!c)return;const old=`${c.language||''}|${c.billingEmail||''}`;c.language=document.getElementById('c21lang').value;c.billingEmail=document.getElementById('c21billing').value.trim();audit(c,'Taal/facturatie gewijzigd',old,`${c.language}|${c.billingEmail}`);store(s);closeOverlay();go('customers');
    }
    else if(x==='merge-reverse'){
      const proxy=document.createElement('button');proxy.dataset.c2='merge-preview';proxy.dataset.keep=a.dataset.keep;proxy.dataset.drop=a.dataset.drop;document.body.appendChild(proxy);proxy.click();proxy.remove();
    }
  },true);

  console.log('RepairFlow Klanten V2.1 quality patch loaded');
})();