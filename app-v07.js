'use strict';
/* RepairFlow V0.7 loader */
(()=>{
  const load=(src,cb)=>{const s=document.createElement('script');s.src=src;s.onload=()=>cb&&cb();s.onerror=()=>console.error('Kon script niet laden:',src);document.body.appendChild(s)};
  const fee=Number(localStorage.getItem('rfAnalysisFeeV31'));if(!Number.isFinite(fee)||fee<=0)localStorage.setItem('rfAnalysisFeeV31','35');
  load('/app-v3.js',()=>load('/app-analysisfee.js',()=>load('/app-analysisfee-ui-fix.js',()=>load('/app-customers-v1.js',()=>load('/app-customers-link-fix.js',()=>load('/app-customers-v2.js',()=>load('/app-customers-v21-quality.js',()=>load('/app-refurb-v1.js'))))))));
})();