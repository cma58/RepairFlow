'use strict';
/* RepairFlow: user-confirmed demonstration dataset cleanup.
   Runs BEFORE legacy modules initialize, never touches app preferences. */
(()=>{
 const MARKER='rfDemoDatasetReset20261106CleanStart';
 const DATA_KEYS=[
  'rf07v3','rf07v2','rfInventoryV3',
  'rfCustomersV1','rfRefurbV1',
  'rfPosProductsV1','rfPosSalesV1','rfPosCartV1','rfPosStockMovementsV1'
 ];
 const SETTINGS_KEYS=[
  'rfAnalysisFeeV31','rfCustomersViewV1','rfRefurbViewV1'
 ];
 const status={performed:false,removed:[],error:null};
 function clearDemo(){
  const snapshot={};
  for(const key of DATA_KEYS){const value=localStorage.getItem(key);if(value!==null)snapshot[key]=value;}
  // If the browser blocks writes, keep the existing records intact.
  try{
   localStorage.setItem(MARKER,'pending');
   for(const key of DATA_KEYS){if(localStorage.getItem(key)!==null){localStorage.removeItem(key);status.removed.push(key);}}
   localStorage.setItem(MARKER,'done');
   status.performed=true;
  }catch(error){
   for(const [key,value] of Object.entries(snapshot)){try{localStorage.setItem(key,value)}catch{}}
   status.error=String(error);
   try{localStorage.removeItem(MARKER)}catch{}
  }
 }
 try{if(localStorage.getItem(MARKER)!=='done')clearDemo();}catch(error){status.error=String(error);}
 window.RepairFlowDemoCleanup={status,dataKeys:DATA_KEYS.slice(),settingsKeys:SETTINGS_KEYS.slice()};
})();
