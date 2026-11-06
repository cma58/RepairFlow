'use strict';
/* RepairFlow eenvoudige reparatielijst: leesbare werkkaarten, bestaande dossieracties behouden. */
(()=>{
 const KEY='rf07v3', $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={'Binnengebracht':['Nieuw','Start de controle'],'Diagnose':['Controleren','Bekijk wat er mis is'],'Wachten op klant':['Wacht op klant','Klant moet beslissen'],'Wachten op onderdeel':['Wacht op onderdeel','Onderdeel nog niet binnen'],'In reparatie':['Herstellen','Voer de reparatie uit'],'Kwaliteitscontrole':['Testen','Controleer of alles werkt'],'Klaar':['Klaar','Klant mag afhalen'],'Afgehaald':['Afgehaald','Reparatie afgerond'],'Geannuleerd':['Geannuleerd','Dossier afgesloten']};
 let lastSignature='';
 const css=document.createElement('style');
 css.textContent=`
 .rf-easy-repairs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:12px}
 .rf-easy-card{border:1px solid #334260;background:#18233d;border-radius:16px;padding:16px;min-width:0}
 .rf-easy-card h3{margin:8px 0;font-size:19px;line-height:1.35;overflow-wrap:anywhere}
 .rf-easy-card p{color:#cbd5e1;margin:6px 0;overflow-wrap:anywhere}
 .rf-easy-card .rf-status{display:inline-block;padding:6px 10px;border-radius:10px;background:#253d57;color:#fff;font-weight:800}
 .rf-easy-card button{width:100%;min-height:48px;margin-top:12px}
 .rf-easy-card .rf-ref{font-size:12px;color:#b8c7e0}
 .rf-easy-note{color:#cbd5e1;margin:10px 0 16px}
 @media(max-width:650px){.rf-easy-repairs{grid-template-columns:1fr}}
 `;
 document.head.appendChild(css);
 function read(){try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return {}}}
 function update(){
  const w=$('repairWorkspace'),page=$('repairs');if(!w||!page?.classList.contains('active'))return;
  // Never replace a full dossier: only the existing list/table view.
  if(!w.querySelector('#repairCards')&&!w.querySelector('.table')&&!w.dataset.rfEasy)return;
  const q=($('repairSearch')?.value||'').trim().toLowerCase(),f=$('repairFilter')?.value||'';
  const rows=Object.entries(read()).filter(([id,r])=>{
   const text=[id,r.name,r.phone,r.device,r.serial,r.customerStatementOriginal,r.location].join(' ').toLowerCase();
   return(!q||text.includes(q))&&(!f||r.status===f);
  }).sort((a,b)=>b[0].localeCompare(a[0]));
  const sig=JSON.stringify([rows.map(([id,r])=>[id,r.status,r.name,r.device,r.phone,r.customerStatementOriginal]),q,f]);
  if(w.dataset.rfEasy&&sig===lastSignature)return;
  lastSignature=sig;w.dataset.rfEasy='yes';
  w.innerHTML='<p class="rf-easy-note">Kies een toestel. Je ziet meteen wat je moet doen.</p><div class="rf-easy-repairs">'+rows.map(([id,r])=>{
   const st=labels[r.status]||[r.status||'Onbekend','Open het dossier'];
   return `<article class="rf-easy-card"><div class="rf-ref">${esc(id)}</div><h3>${esc(r.device||'Toestel onbekend')}</h3><p><b>${esc(r.name||'Onbekende klant')}</b> · ${esc(r.phone||'')}</p><p>${esc(r.customerStatementOriginal||'Geen probleemomschrijving')}</p><div class="rf-status">${esc(st[0])}</div><p>${esc(st[1])}</p><button class="btn g" data-action="repair-open-full" data-ticket="${esc(id)}">Open reparatie →</button></article>`;
  }).join('')+'</div>'+(rows.length?'':'<div class="card">Geen reparaties gevonden.</div>');
 }
 const observer=new MutationObserver(()=>update());
 observer.observe(document.body,{subtree:true,childList:true});
 document.addEventListener('input',e=>{if(e.target.id==='repairSearch')queueMicrotask(update)});
 document.addEventListener('change',e=>{if(e.target.id==='repairFilter')queueMicrotask(update)});
 update();
})();