'use strict';
/* RepairFlow V3.2 — analysekost zichtbaarheid + nulbedrag guard */
(() => {
  const KEY='rfAnalysisFeeV31';
  const FALLBACK=35;
  const raw=localStorage.getItem(KEY);
  const amount=Number(raw);
  if(raw===null || !Number.isFinite(amount) || amount<=0){
    localStorage.setItem(KEY,String(FALLBACK));
  }

  const styleFeeCards=()=>{
    document.querySelectorAll('#oc .demo-card').forEach(card=>{
      const txt=(card.textContent||'').toLowerCase();
      if(txt.includes('analysekost')){
        card.style.background='#fff7e6';
        card.style.color='#1f2937';
        card.style.border='1px solid #f0b84c';
        card.style.borderRadius='10px';
        card.style.padding='12px';
        card.style.lineHeight='1.45';
        card.style.whiteSpace='normal';
        card.style.overflow='visible';
      }
    });
  };

  const wrap=(name)=>{
    const original=window[name];
    if(typeof original!=='function')return;
    window[name]=function(...args){
      const out=original.apply(this,args);
      requestAnimationFrame(styleFeeCards);
      return out;
    };
  };
  ['newRepair','kioskForm','tabContent'].forEach(wrap);

  const observer=new MutationObserver(styleFeeCards);
  observer.observe(document.body,{childList:true,subtree:true});
  styleFeeCards();
  console.log('RepairFlow analysekost V3.2 UI fix loaded');
})();