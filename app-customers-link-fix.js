'use strict';
/* Klanten V1.1 — harde koppeling nieuwe reparatie aan centrale klant/toestel */
(() => {
  const KEY='rfCustomersV1';
  const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const nPhone=v=>String(v||'').replace(/\D/g,'');
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{};}catch(e){return {};}};
  document.addEventListener('click',e=>{
    const a=e.target.closest('[data-action="repair-create"]');
    if(!a)return;
    const phone=$('rnPhone')?.value||'',email=$('rnEmail')?.value||'',model=$('rnDevice')?.value||'',serial=$('rnSerial')?.value||'',type=$('rnType')?.value||'Smartphone';
    const store=load();
    const c=Object.values(store).find(x=>(phone&&nPhone(x.phone)===nPhone(phone))||(email&&norm(x.email)===norm(email)));
    if(!c)return;
    const expected='REP-2026-'+String(next+1).padStart(5,'0');
    let device=(c.devices||[]).find(d=>(serial&&norm(d.serial)===norm(serial))||norm(d.brandModel)===norm(model));
    if(!device){device={id:'DEV-'+Date.now().toString(36),type,brandModel:model,serial,color:'',nickname:'',createdAt:now(),archived:false};c.devices=c.devices||[];c.devices.push(device);c.audit=c.audit||[];c.audit.unshift({id:'CAUD-'+Date.now().toString(36),at:now(),actor:'Amine',action:'Toestel toegevoegd via nieuwe reparatie',oldValue:'',newValue:model});localStorage.setItem(KEY,JSON.stringify(store));}
    setTimeout(()=>{const r=repairs[expected];if(!r)return;r.customerId=c.id;r.deviceId=device.id;save();console.log('RepairFlow klant gekoppeld',expected,c.id,device.id);},0);
  },true);
})();