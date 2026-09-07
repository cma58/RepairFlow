'use strict';
/* RepairFlow Reparaties V3.1 — analysekost & retour zonder reparatie */
(() => {
  const FEE_KEY='rfAnalysisFeeV31';
  const DEFAULT_FEE=35;
  let configuredFee=Number(localStorage.getItem(FEE_KEY));
  if(!Number.isFinite(configuredFee)||configuredFee<0) configuredFee=DEFAULT_FEE;

  const feeOf=r=>Number.isFinite(+r.analysisFeeAmount)?+r.analysisFeeAmount:configuredFee;
  const analysisEarned=r=>!!r.analysisFeeEarned;
  const activeBillableTotal=r=>{
    const q=currentQuote(r);
    if(q && q.status==='approved') return Math.max(+q.amount||0, feeOf(r));
    return analysisEarned(r)?feeOf(r):0;
  };

  const originalMk=mk;
  mk=function(x={}){
    const r=originalMk(x);
    if(!Number.isFinite(+r.analysisFeeAmount)) r.analysisFeeAmount=configuredFee;
    if(typeof r.analysisFeeAccepted!=='boolean') r.analysisFeeAccepted=true;
    if(typeof r.analysisFeeEarned!=='boolean') r.analysisFeeEarned=false;
    if(!r.analysisFeeAcceptedAt) r.analysisFeeAcceptedAt=now();
    return r;
  };

  Object.values(repairs).forEach(r=>{
    if(!Number.isFinite(+r.analysisFeeAmount)) r.analysisFeeAmount=configuredFee;
    if(typeof r.analysisFeeAccepted!=='boolean') r.analysisFeeAccepted=true;
    if(typeof r.analysisFeeEarned!=='boolean') r.analysisFeeEarned=!['Binnengebracht'].includes(r.status);
    if(!r.analysisFeeAcceptedAt) r.analysisFeeAcceptedAt=now();
  });

  if(!STATUS.includes('Klaar zonder reparatie')) STATUS.splice(STATUS.indexOf('Klaar'),0,'Klaar zonder reparatie');
  STATUS_META['Klaar zonder reparatie']={label:'Klaar zonder reparatie',desc:'Diagnose is afgerond; toestel wordt zonder herstel teruggegeven. Alleen de verschuldigde analysekost blijft open.'};
  TRANSITIONS['Wachten op klant']=[...new Set([...(TRANSITIONS['Wachten op klant']||[]),'Klaar zonder reparatie'])];
  TRANSITIONS['Diagnose']=[...new Set([...(TRANSITIONS['Diagnose']||[]),'Klaar zonder reparatie'])];
  TRANSITIONS['Klaar zonder reparatie']=['Afgehaald'];

  const originalSetStatus=setStatus;
  setStatus=function(r,newStatus,reason=''){
    const old=r.status;
    const ok=originalSetStatus(r,newStatus,reason);
    if(ok && old==='Binnengebracht' && newStatus==='Diagnose' && !r.analysisFeeEarned){
      r.analysisFeeEarned=true;
      log(r,'Analysekost geactiveerd','Niet verschuldigd',euro(feeOf(r)),'systeem','billing');
    }
    if(ok && newStatus==='Klaar zonder reparatie' && !r.analysisFeeEarned){
      r.analysisFeeEarned=true;
      log(r,'Analysekost geactiveerd','Niet verschuldigd',euro(feeOf(r)),'systeem','billing');
    }
    return ok;
  };

  due=function(r){return Math.max(0,activeBillableTotal(r)-paidTotal(r));};

  const originalCalc=calc;
  calc=function(r){
    const c=originalCalc(r);
    const fee=feeOf(r);
    return {...c,analysisFee:fee,total:c.parts+c.labor+c.other+fee};
  };

  const feeNotice=()=>`<div class="demo-card" style="margin:12px 0;border-color:#f0b84c"><b>Analysekost: ${euro(configuredFee)}</b><p class="small" style="margin:6px 0 0">Deze kost dekt de diagnose- en onderzoekstijd en blijft verschuldigd zodra de diagnose is uitgevoerd, ook wanneer het toestel niet herstelbaar is of u beslist de reparatie niet te laten uitvoeren.</p></div>`;
  const originalNewRepair=newRepair;
  newRepair=function(){originalNewRepair();const oc=$('oc');if(oc){const h=oc.querySelector('h3');if(h)h.insertAdjacentHTML('beforebegin',feeNotice());}};
  const originalKioskForm=kioskForm;
  kioskForm=function(type){originalKioskForm(type);const oc=$('oc');if(oc){const btn=oc.querySelector('[data-action="submit"]');if(btn)btn.insertAdjacentHTML('beforebegin',feeNotice());const cf=$('cf');if(cf){const label=cf.closest('label');if(label)label.innerHTML=`<input id="cf" class="check" type="checkbox"> Ik bevestig mijn probleemomschrijving en ga akkoord met de analysekost van <b>${euro(configuredFee)}</b> zodra de diagnose is uitgevoerd.`;}}};

  const originalTabContent=tabContent;
  tabContent=function(ticket,r,c){
    let html=originalTabContent(ticket,r,c);
    const fee=feeOf(r);
    if(activeRepairTab==='overview') html=`<div class="demo-card" style="margin-bottom:12px;border-color:#f0b84c"><div class="row space wrap"><div><b>Analysekost ${euro(fee)}</b><div class="small muted">${analysisEarned(r)?'Diagnose uitgevoerd · kost verschuldigd':'Vastgelegd bij intake · wordt verschuldigd zodra diagnose start'}</div></div><span class="badge">${analysisEarned(r)?'Verschuldigd':'Nog niet geactiveerd'}</span></div></div>`+html;
    if(activeRepairTab==='quote') html=`<div class="demo-card" style="margin-bottom:12px"><b>Prijsopbouw</b><p class="small">De analysekost van ${euro(fee)} is een vaste lijn in de prijsopbouw. Een goedgekeurde offerte moet minstens dit bedrag omvatten.</p></div>`+html;
    if(activeRepairTab==='payment'){
      const q=currentQuote(r);
      const basis=q&&q.status==='approved'?`Goedgekeurde offerte incl. analyse: ${euro(activeBillableTotal(r))}`:`Alleen analysekost verschuldigd: ${euro(analysisEarned(r)?fee:0)}`;
      html=`<div class="demo-card" style="margin-bottom:12px"><b>Te innen basis</b><p>${basis}</p></div>`+html;
      if(r.status==='Klaar zonder reparatie'&&due(r)<=0) html+=`<div class="demo-card" style="margin-top:12px"><b>Retour zonder reparatie</b><p>Analysekost voldaan. Het toestel kan nu worden teruggegeven.</p><button class="btn g" data-action="pickup-no-repair" data-ticket="${esc(ticket)}">Toestel teruggegeven</button></div>`;
    }
    return html;
  };

  const originalOverviewActions=overviewActions;
  overviewActions=function(ticket,r){
    let html=originalOverviewActions(ticket,r)||'';
    const q=currentQuote(r);
    if((r.status==='Wachten op klant'&&(r.outcome==='Niet herstelbaar'||q?.status==='rejected'))||r.status==='Diagnose'&&r.outcome==='Niet herstelbaar') html+=` <button class="btn r" data-action="close-no-repair" data-ticket="${esc(ticket)}">Afronden zonder reparatie</button>`;
    return html;
  };

  document.addEventListener('click',e=>{
    const a=e.target.closest('[data-action]');
    if(!a)return;
    if(a.dataset.action==='repair-save-quote'){
      const r=repairs[a.dataset.ticket];
      const amount=+$('rqAmount')?.value;
      if(r && amount<feeOf(r)){e.preventDefault();e.stopImmediatePropagation();toast('Offerte kan niet lager zijn dan de analysekost van '+euro(feeOf(r))+'.');}
    }
    if(a.dataset.action==='close-no-repair'){
      e.preventDefault();e.stopImmediatePropagation();
      const r=repairs[a.dataset.ticket];
      if(!r)return;
      if(!r.analysisFeeEarned){r.analysisFeeEarned=true;log(r,'Analysekost geactiveerd','Niet verschuldigd',euro(feeOf(r)),'systeem','billing');}
      if(setStatus(r,'Klaar zonder reparatie','Niet herstelbaar of klant ziet af van reparatie')){save();activeRepairTab='payment';detail(a.dataset.ticket,'payment');toast('Dossier klaar voor retour · alleen analysekost blijft open.');}
    }
    if(a.dataset.action==='pickup-no-repair'){
      e.preventDefault();e.stopImmediatePropagation();
      const r=repairs[a.dataset.ticket];
      if(!r)return;
      if(due(r)>0){toast('Analysekost moet eerst volledig betaald zijn.');return;}
      if(r.status!=='Klaar zonder reparatie'){toast('Dossier staat niet klaar voor retour.');return;}
      if(setStatus(r,'Afgehaald','Retour zonder reparatie')){
        if(r.unlock){r.unlock='';log(r,'Toestelcode automatisch gewist','[ingesteld]','[gewist]','systeem','security');}
        r.warranty=false;
        log(r,'Toestel teruggegeven zonder reparatie','','Analysekost voldaan','Amine','balie');
        save();detail(a.dataset.ticket,'overview');toast('Toestel teruggegeven · dossier afgerond.');
      }
    }
    if(a.dataset.action==='analysis-fee-settings'){
      e.preventDefault();e.stopImmediatePropagation();
      overlay('Analysekost instellen',`<div class="oc"><label>Standaard analysekost (€)</label><input id="analysisFeeSetting" type="number" min="0" step="0.01" value="${configuredFee.toFixed(2)}"><p class="small muted">Dit nieuwe bedrag geldt voor nieuwe dossiers. Bestaande dossiers behouden het bedrag dat bij hun intake werd vastgelegd.</p><button class="btn g" data-action="analysis-fee-save">Opslaan</button></div>`);
    }
    if(a.dataset.action==='analysis-fee-save'){
      e.preventDefault();e.stopImmediatePropagation();
      const v=+$('analysisFeeSetting')?.value;
      if(!(v>=0)){toast('Vul een geldig bedrag in.');return;}
      configuredFee=v;localStorage.setItem(FEE_KEY,String(v));closeOverlay();toast('Standaard analysekost ingesteld op '+euro(v)+'.');
    }
  },true);

  const originalRepairShell=repairShell;
  repairShell=function(){
    originalRepairShell();
    const host=document.querySelector('#repairs .toolbar');
    if(host&&!host.querySelector('[data-action="analysis-fee-settings"]')) host.insertAdjacentHTML('afterbegin',`<button class="btn s" data-action="analysis-fee-settings">Analysekost ${euro(configuredFee)}</button>`);
  };

  save();
  repairShell();
  if(document.querySelector('#repairs.page.active')) renderRepairList();
  console.log('RepairFlow analysekost V3.1 loaded');
})();