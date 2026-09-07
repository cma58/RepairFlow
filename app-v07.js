'use strict';
const repairFlowV3=document.createElement('script');
repairFlowV3.src='/app-v3.js';
repairFlowV3.defer=true;
repairFlowV3.onload=()=>{
  const analysisFeeLayer=document.createElement('script');
  analysisFeeLayer.src='/app-analysisfee.js';
  analysisFeeLayer.defer=true;
  document.head.appendChild(analysisFeeLayer);
};
document.head.appendChild(repairFlowV3);