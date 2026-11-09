'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhixarContext=api})(typeof globalThis==='object'?globalThis:this,()=>{
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const CONTEXT_KEY='rf:selected-context:v1';
 function selected(storage=globalThis.sessionStorage){let value;try{value=storage.getItem(CONTEXT_KEY)}catch{return null}return typeof value==='string'&&/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i.test(value)&&value.split(':').every(x=>UUID.test(x))?value:null}
 function choose(value,storage=globalThis.sessionStorage){if(value!==null&&(!selected({getItem:()=>value})||typeof value!=='string'))throw Error('Ongeldige contextkeuze');if(value===null)storage.removeItem(CONTEXT_KEY);else storage.setItem(CONTEXT_KEY,value)}
 function headers(){const value=selected();return value?{'x-repairflow-context':value}:{}}
 const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
 function scope(context){if(!object(context)||!['organizationId','branchId','staffId'].every(k=>UUID.test(context[k]))||!['owner','manager'].includes(context.role))throw Error('Ongeldige winkelcontext');return [context.organizationId,context.branchId,context.staffId].join(':')}
 function lines(value){return Array.isArray(value)&&value.length<=50&&value.every(l=>object(l)&&['product','repair','refurbished'].includes(l.type)&&UUID.test(l.id)&&Number.isSafeInteger(l.quantity)&&l.quantity>=1&&l.quantity<=999&&(l.type==='product'||l.quantity===1))&&new Set(value.map(l=>l.type+':'+l.id)).size===value.length}
 function payment(p){return object(p)&&['cash','card','transfer'].includes(p.method)&&Number.isSafeInteger(p.amountCents)&&p.amountCents>0&&p.amountCents<=1e12}
 function pending(value){return value===null||object(value)&&value.action==='checkout'&&UUID.test(value.requestId)&&lines(value.lines)&&value.lines.length>0&&Array.isArray(value.payments)&&value.payments.length>0&&value.payments.length<=5&&value.payments.every(payment)}
 function writes(value){return object(value)&&Object.entries(value).every(([key,x])=>['customer','repair','product','stock','refurb','repairCommand'].includes(key)&&object(x)&&x.action===key&&UUID.test(x.requestId))}
 function restore(storage,context){const prefix='rfCloudV2:'+scope(context)+':';const keys={cart:prefix+'cart',pending:prefix+'pending',writes:prefix+'writes'};const read=(key,fallback,valid)=>{const raw=storage.getItem(key);if(raw===null)return fallback;let value;try{value=JSON.parse(raw)}catch{throw Error('Beschadigde winkelconcepten; originele gegevens blijven behouden.')}if(!valid(value))throw Error('Ongeldige winkelconcepten; originele gegevens blijven behouden.');return value};return {keys,cart:read(keys.cart,[],lines),pending:read(keys.pending,null,pending),writes:read(keys.writes,{},writes)}}
 function date(value){const d=new Date(value);return Number.isNaN(d.getTime())?'Datum niet beschikbaar':d.toLocaleString('nl-BE',{timeZone:'Europe/Brussels'})}
 return {scope,restore,lines,pending,writes,date,selected,choose,headers};
});
