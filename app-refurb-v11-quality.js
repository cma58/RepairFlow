'use strict';
/* RepairFlow Refurbished V1.1 quality gate */
(()=>{
const KEY='rfRefurbV1';
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY))||[]}catch{return[]}},write=a=>localStorage.setItem(KEY,JSON.stringify(a));
const toast=m=>window.toast?window.toast(m):alert(m);
const qcNames=['Visuele controle','Scherm & touch','Laden / batterij','Camera','Microfoon & speakers','Wi-Fi / Bluetooth','Biometrie','Knoppen & poorten','IMEI/serial controle','Eindtest zonder foutmelding'];
const qcDone=r=>qcNames.every(x=>r.qc?.[x]);
const total=r=>(+r.purchasePrice||0)+(r.costs||[]).reduce((s,x)=>s+(+x.amount||0),0);
const audit=(r,a,o='',n='')=>{r.audit=r.audit||[];r.audit.unshift({id:'RAUD-'+Date.now().toString(36),at:new Date().toISOString(),actor:'Huidige gebruiker',action:a,oldValue:String(o??''),newValue:String(n??'')})};
function find(id){return read().find(x=>x.id===id)}
function persist(r){let a=read(),i=a.findIndex(x=>x.id===r.id);if(i>=0){a[i]=r;write(a)}}
function refresh(id,tab='overview'){try{if(typeof window.go==='function')window.go('refurb');setTimeout(()=>{const b=document.querySelector(`[data-rfb="open"][data-id="${CSS.escape(id)}"]`);b?.click();setTimeout(()=>document.querySelector(`[data-rfb="tab"][data-id="${CSS.escape(id)}"][data-tab="${tab}"]`)?.click(),0)},0)}catch{}}
// Lifecycle guard: direct status->Verkocht is forbidden; sale record is mandatory. Ready requires commercial + QC data.
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-rfb]'); if(!b)return; const act=b.dataset.rfb,id=b.dataset.id,r=id&&find(id); if(!r)return;
 if(act==='status'&&b.dataset.status==='Verkocht'){e.preventDefault();e.stopImmediatePropagation();toast('Registreer de verkoop via het tabblad Verkoop. Zo blijven klant, bedrag en garantie gekoppeld.');return}
 if(act==='status'&&b.dataset.status==='Verkoopklaar'){
   const missing=[];if(!qcDone(r))missing.push('volledige QC');if(!r.grade)missing.push('grade');if(!r.location)missing.push('voorraadlocatie');if(!(+r.salePrice>0))missing.push('verkoopprijs');
   if(missing.length){e.preventDefault();e.stopImmediatePropagation();toast('Nog niet verkoopklaar: '+missing.join(', ')+'.');return}
 }
 if(act==='status'&&['Afgekeurd','Onderdelen-donor'].includes(b.dataset.status)){if(!confirm(`Toestel markeren als ${b.dataset.status}? De historie blijft bewaard.`)){e.preventDefault();e.stopImmediatePropagation();return}}
 if(act==='cost-del'){if(!confirm('Deze kostenregel verwijderen? De wijziging wordt in audit bewaard.')){e.preventDefault();e.stopImmediatePropagation();return}}
 if(act==='qc-check'&&['Verkocht','Afgekeurd','Onderdelen-donor'].includes(r.status)){e.preventDefault();e.stopImmediatePropagation();toast('QC van een afgesloten toestel kan niet stil worden gewijzigd. Open eerst een retour/herinspectie.');return}
 if(act==='edit'){
   e.preventDefault();e.stopImmediatePropagation();
   const old={brand:r.brand,model:r.model,storage:r.storage,color:r.color,imei:r.imei,serial:r.serial};
   const brand=prompt('Merk',r.brand||'');if(brand===null)return;const model=prompt('Model',r.model||'');if(model===null)return;const storage=prompt('Opslag',r.storage||'');if(storage===null)return;const color=prompt('Kleur',r.color||'');if(color===null)return;const imei=prompt('IMEI',r.imei||'');if(imei===null)return;const serial=prompt('Serienummer',r.serial||'');if(serial===null)return;
   if(!brand.trim()||!model.trim()){toast('Merk en model zijn verplicht.');return}
   const dup=read().find(x=>x.id!==r.id&&((imei.trim()&&String(x.imei||'').replace(/\s/g,'')===imei.trim().replace(/\s/g,''))||(serial.trim()&&String(x.serial||'').toLowerCase()===serial.trim().toLowerCase())));
   if(dup){toast('IMEI/serienummer bestaat al in '+dup.id);return}
   Object.assign(r,{brand:brand.trim(),model:model.trim(),storage:storage.trim(),color:color.trim(),imei:imei.trim(),serial:serial.trim()});audit(r,'Toestelgegevens gewijzigd',JSON.stringify(old),JSON.stringify({brand:r.brand,model:r.model,storage:r.storage,color:r.color,imei:r.imei,serial:r.serial}));persist(r);refresh(r.id);toast('Toestelgegevens opgeslagen.');return
 }
 if(act==='sell-confirm'){
   const amount=+(document.getElementById('rva')?.value||0);if(amount<total(r)){if(!confirm(`Verkoopprijs ligt onder de totale kost (${total(r).toFixed(2)}). Verkoop met verlies toch bevestigen?`)){e.preventDefault();e.stopImmediatePropagation();return}}
 }
},true);
// Extra operational cues without replacing V1 rendering.
const enhance=()=>{
 const root=document.getElementById('rfb');if(!root)return;
 root.querySelectorAll('.demo-card').forEach(c=>{if(c.dataset.v11)return;c.dataset.v11='1'});
 const detail=document.getElementById('rfbdetail');if(detail&&!detail.querySelector('.rfb-v11-note')){
   const id=detail.querySelector('[data-rfb="tab"]')?.dataset.id,r=id&&find(id);if(r){const age=r.purchaseDate?Math.max(0,Math.floor((Date.now()-new Date(r.purchaseDate+'T00:00:00').getTime())/86400000)):0;const note=document.createElement('div');note.className='demo-card rfb-v11-note';note.style.marginTop='8px';note.innerHTML=`<b>Voorraadcontrole</b> · ${age} dagen in voorraad${age>=30?' · <b>Let op: lang in voorraad</b>':''}`;detail.querySelector('.card')?.appendChild(note)}}
};
new MutationObserver(enhance).observe(document.documentElement,{subtree:true,childList:true});enhance();
console.log('RepairFlow Refurbished V1.1 quality gate loaded');
})();