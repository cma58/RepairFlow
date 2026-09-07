'use strict';
const feeKey='rfAnalysisFeeV31';
const feeRaw=localStorage.getItem(feeKey);
const feeValue=Number(feeRaw);
if(feeRaw===null || !Number.isFinite(feeValue) || feeValue<=0){
  localStorage.setItem(feeKey,'35');
}
const repairFlowV3=document.createElement('script');
repairFlowV3.src='/app-v3.js';
repairFlowV3.defer=true;
repairFlowV3.onload=()=>{
  const analysisFeeLayer=document.createElement('script');
  analysisFeeLayer.src='/app-analysisfee.js';
  analysisFeeLayer.defer=true;
  analysisFeeLayer.onload=()=>{
    const analysisFeeUiFix=document.createElement('script');
    analysisFeeUiFix.src='/app-analysisfee-ui-fix.js';
    analysisFeeUiFix.defer=true;
    analysisFeeUiFix.onload=()=>{
      const customersV1=document.createElement('script');
      customersV1.src='/app-customers-v1.js';
      customersV1.defer=true;
      document.head.appendChild(customersV1);
    };
    document.head.appendChild(analysisFeeUiFix);
  };
  document.head.appendChild(analysisFeeLayer);
};
document.head.appendChild(repairFlowV3);