'use strict';
/* RepairFlow Next home UI. No writes to localStorage; existing handlers remain authoritative. */
(()=>{
 const $=id=>document.getElementById(id);
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const read=(key,fallback)=>{try{const data=JSON.parse(localStorage.getItem(key));return data??fallback}catch{return fallback}};
 const nav=document.querySelector('.nav'),home=$('dashboard');
 if(!nav||!home)return;
 const more=document.createElement('details');more.className='rf-nav-more';
 more.innerHTML='<summary>Meer functies</summary>';
 const mainPages=new Set(['dashboard','repairs','customers','refurb','sales']);
 [...nav.querySelectorAll('[data-page]')].forEach(btn=>{if(!mainPages.has(btn.dataset.page))more.appendChild(btn)});
 nav.appendChild(more);
 const old=home.innerHTML;
 home.innerHTML=`<div class="rf-home"><div class="rf-home-intro"><h2>Waarmee kan ik je helpen?</h2><p>Kies wat je wilt doen. De rest regelen we stap voor stap.</p></div>
 <div class="rf-actions">
 <button class="rf-action" data-action="repair-new"><span class="rf-emoji">🛠️</span><strong>Reparatie aannemen</strong><small>Nieuw toestel registreren</small></button>
 <button class="rf-action" data-page="sales"><span class="rf-emoji">🛍️</span><strong>Verkopen</strong><small>Ga naar de kassa</small></button>
 <button class="rf-action" data-page="refurb"><span class="rf-emoji">📱</span><strong>Refurbished</strong><small>Toestel inkopen of beheren</small></button>
 <button class="rf-action" data-page="customers"><span class="rf-emoji">👥</span><strong>Klanten</strong><small>Klant zoeken of openen</small></button>
 </div><div class="rf-home-lower"><div class="rf-panel"><h3>Wat heeft aandacht nodig?</h3><div id="rfAttention"></div><button class="btn s" data-page="repairs" style="margin-top:14px">Alle reparaties bekijken</button></div>
 <div class="rf-panel"><h3>Snel een reparatie vinden</h3><input id="rfSearch" class="rf-search" type="search" placeholder="Naam, ticket, IMEI of toestel" aria-label="Reparatie zoeken"><div id="rfResults" class="rf-search-results"></div><p class="rf-muted">Zoekt in de reparaties van deze browser.</p></div></div></div>`;
 function repairs(){const r=read('rf07v3',{});return r&&typeof r==='object'&&!Array.isArray(r)?r:{}}
 function renderAttention(){const rows=Object.values(repairs()),count=s=>rows.filter(r=>r&&r.status===s).length;
 const items=[['Klaar voor afhaling',count('Klaar')],['Wacht op klant',count('Wachten op klant')],['Wacht op onderdeel',count('Wachten op onderdeel')],['In reparatie',count('In reparatie')]];
 $('rfAttention').innerHTML=items.map(([name,n])=>`<div class="rf-status-line"><span>${safe(name)}</span><b>${n}</b></div>`).join('')||'<p>Nog geen reparaties.</p>';}
 function search(){const q=$('rfSearch')?.value.trim().toLowerCase()||'',out=$('rfResults');if(!out)return;
 if(q.length<2){out.innerHTML='';return}
 const matches=Object.entries(repairs()).filter(([id,r])=>[id,r.name,r.phone,r.device,r.serial].some(x=>String(x??'').toLowerCase().includes(q))).slice(0,8);
 out.innerHTML=matches.map(([id,r])=>`<button class="rf-search-hit" data-action="repair-open-full" data-ticket="${safe(id)}"><strong>${safe(r.device||'Toestel')}</strong> · ${safe(r.name||'Klant')}<br><span class="rf-muted">${safe(id)} · ${safe(r.status||'')}</span></button>`).join('')||'<p class="rf-muted">Geen reparatie gevonden.</p>';}
 $('rfSearch').addEventListener('input',search);
 document.addEventListener('click',e=>{if(e.target.closest('[data-page]')){queueMicrotask(()=>{if($('dashboard')?.classList.contains('active'))renderAttention()})}});
 window.addEventListener('storage',()=>{renderAttention();search()});
 renderAttention();
})();
