'use strict';
const crypto=require('node:crypto');
const known={rf07v3:'object',rfInventoryV3:'object',rfCustomersV1:'object-or-array',rfRefurbV1:'array',rfPosProductsV1:'array',rfPosSalesV1:'array',rfPosStockMovementsV1:'array'};
function plainObject(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function analyzeBackup(raw){
 if(typeof raw!=='string'&&!Buffer.isBuffer(raw))throw Error('Backup moet ruwe tekst of bytes zijn');
 const bytes=Buffer.isBuffer(raw)?raw:Buffer.from(raw),report={sha256:crypto.createHash('sha256').update(bytes).digest('hex'),format:null,counts:{},errors:[],warnings:[],readyForImport:false};
 let backup;try{backup=JSON.parse(bytes.toString('utf8'))}catch{report.errors.push('Backupbestand bevat onleesbare JSON');return report}
 if(!plainObject(backup)||backup.version!==1){report.errors.push('Onbekend back-upformaat of versie');return report}
 let source;
 if(backup.format==='RepairFlow-browser-backup'&&plainObject(backup.keys)){report.format=backup.format;source=backup.keys}
 else if(backup.format==='repairflow-local-backup'&&plainObject(backup.repairs)&&plainObject(backup.inventory)){
  report.format=backup.format;source={rf07v3:JSON.stringify(backup.repairs),rfInventoryV3:JSON.stringify(backup.inventory)};
  report.warnings.push('Reparatie-export bevat geen klanten, refurbished, POS-verkopen of betaalhistorie; maak ook de volledige browserexport op dit apparaat');
 }else{report.errors.push('Onbekend back-upformaat of ontbrekende sleutelkaart');return report}
 const values={};
 for(const [key,type] of Object.entries(known)){
  if(!Object.hasOwn(source,key)){report.warnings.push(key+' ontbreekt');continue}
  if(typeof source[key]!=='string'){report.errors.push(key+' is niet als ruwe browserwaarde bewaard');continue}
  let value;try{value=JSON.parse(source[key])}catch{report.errors.push(key+' bevat onleesbare JSON');continue}
  if(type==='array'&&!Array.isArray(value)||type==='object'&&!plainObject(value)||type==='object-or-array'&&!plainObject(value)&&!Array.isArray(value)){
   report.errors.push(key+' heeft een onverwachte gegevensvorm');continue
  }
  values[key]=value;report.counts[key]=Array.isArray(value)?value.length:Object.keys(value).length;
 }
 const unknown=Object.keys(source).filter(key=>/^(rf|repairflow)/i.test(key)&&!Object.hasOwn(known,key));
 if(unknown.length)report.warnings.push(unknown.length+' overige browserwaarden moeten afzonderlijk worden gemapt en bewaard');
 function duplicate(items,field,name,normalize=x=>String(x)){
  const seen=new Set();let count=0;
  for(const item of items){const value=item?.[field];if(value==null||value==='')continue;const key=normalize(value);if(seen.has(key))count++;else seen.add(key)}
  if(count)report.errors.push(name+': '+count+' dubbele '+field+'-waarden');
 }
 const repairs=values.rf07v3?Object.values(values.rf07v3):[],customers=values.rfCustomersV1?(Array.isArray(values.rfCustomersV1)?values.rfCustomersV1:Object.values(values.rfCustomersV1)):[];
 duplicate(repairs,'id','Reparaties');duplicate(customers,'id','Klanten');
 for(const key of ['rfRefurbV1','rfPosProductsV1','rfPosSalesV1','rfPosStockMovementsV1'])if(values[key])duplicate(values[key],'id',key);
 if(values.rfPosSalesV1)duplicate(values.rfPosSalesV1,'number','Verkopen');
 const imeis=[...(values.rfRefurbV1||[]),...(values.rfPosProductsV1||[])].filter(x=>x?.imei);
 duplicate(imeis,'imei','Toestellen',x=>String(x).replace(/[\s-]/g,'').toUpperCase());
 if(!values.rfCustomersV1&&repairs.length)report.warnings.push('Klantkoppelingen kunnen met deze export niet worden geverifieerd');
 if(!values.rfPosSalesV1&&values.rfPosProductsV1)report.warnings.push('POS-voorraad zonder verkoophistorie: geen financiële import afleiden');
 // A clean structure is only eligible for a human-reviewed mapping and dry-run.
 report.readyForImport=false;
 return report;
}
module.exports={analyzeBackup};
