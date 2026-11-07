'use strict';
// Read-only browser-backup preflight. No network, no writes, no personal data in report.
const MAX_BYTES=12*1024*1024,MAX_KEYS=150;
const FIELDS={
 rf07v3:'Reparaties',rfCustomersV1:'Klanten',rfInventoryV3:'Onderdelen (legacy)',
 rfRefurbV1:'Refurbished',rfPosProductsV1:'Kassaproducten',
 rfPosSalesV1:'Kassaverkopen',rfPosStockMovementsV1:'Voorraadmutaties',
 rfPosCartV1:'Open winkelmand (niet importeren)',rfBusinessSettingsV1:'Bedrijfsinstellingen'
};
function plainObject(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)}
function countRecords(value,key){
 if(key==='rf07v3')return plainObject(value)?Object.keys(value).length:null;
 if(Array.isArray(value))return value.length;
 if(plainObject(value))return Object.keys(value).length;
 return null;
}
function inspectBackup(input){
 if(typeof input!=='string'||Buffer.byteLength(input,'utf8')>MAX_BYTES)throw Error('Back-upbestand ongeldig of te groot');
 const backup=JSON.parse(input);
 if(!plainObject(backup)||backup.format!=='RepairFlow-browser-backup'||backup.version!==1||!plainObject(backup.keys))
  throw Error('Geen herkenbare RepairFlow-back-up');
 const keys=Object.keys(backup.keys);
 if(keys.length>MAX_KEYS||keys.some(k=>!(/^(rf|repairflow)[a-zA-Z0-9_-]*$/i.test(k))||typeof backup.keys[k]!=='string'))
  throw Error('Ongeldige back-upvelden');
 const modules=[];
 for(const [key,label] of Object.entries(FIELDS)){
  const present=Object.prototype.hasOwnProperty.call(backup.keys,key);
  if(!present){modules.push({key,label,present:false,count:null,validJson:null});continue}
  let count=null,validJson=false;
  try{const parsed=JSON.parse(backup.keys[key]);count=countRecords(parsed,key);validJson=true;}catch{}
  modules.push({key,label,present:true,count,validJson});
 }
 const unexpectedKeys=keys.filter(k=>!Object.hasOwn(FIELDS,k)).length;
 const warnings=[];
 if(!modules.find(m=>m.key==='rf07v3').present)warnings.push('Geen rf07v3-reparatiegegevens gevonden');
 if(modules.some(m=>m.present&&!m.validJson))warnings.push('Minstens één gegevensmodule bevat ongeldige JSON');
 if(unexpectedKeys)warnings.push('Extra modules gevonden; afzonderlijke mapping nodig');
 return {format:backup.format,version:backup.version,modules,unexpectedKeys,warnings,readOnly:true};
}
module.exports={inspectBackup,MAX_BYTES};
