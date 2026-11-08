'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../repairflow-erp-pos.js'),'utf8');
function harness(initial={}){
 const data=new Map(Object.entries(initial)),listeners={},messages=[];
 const storage={getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const document={getElementById:id=>id==='rfPaymentMethod'?{value:'Cash'}:id==='rfSaleCustomer'?{value:''}:null,addEventListener:(name,fn)=>{listeners[name]=fn}};
 const context={document,localStorage:storage,alert:m=>messages.push(m),confirm:()=>true,FormData:class {constructor(form){this.form=form}get(k){return this.form.fields[k]}},Intl,Date,Math,Number,JSON,Set,Map,globalThis:{crypto:{randomUUID:()=> 'generated-id'}}};
 vm.runInNewContext(source,context);
 function submit(fields){listeners.submit({target:{id:'rfProductForm',fields},preventDefault(){}})}
 function checkout(){listeners.click({target:{closest:()=>({dataset:{rf:'checkout'}})},preventDefault(){},stopImmediatePropagation(){}})}
 return {data,messages,submit,checkout};
}
const product={id:'P1',name:'Phone',sku:'P1',price:100,stock:1,active:true};
const fields={name:'Second phone',sku:'P2',imei:'12 34',price:'100',cost:'20',stock:'1',vat:'21'};
test('corrupt sales cannot be overwritten by a local checkout',()=>{
 const initial={rfPosProductsV1:JSON.stringify([product]),rfPosSalesV1:'{broken',rfPosCartV1:JSON.stringify([{id:'P1',name:'Phone',price:100,qty:1}])};
 const h=harness(initial);h.checkout();
 assert.equal(h.data.get('rfPosSalesV1'),'{broken');
 assert.equal(h.data.get('rfPosProductsV1'),initial.rfPosProductsV1);
 assert.match(h.messages.join(' '),/beschadigd/);
});
test('corrupt refurbished data blocks IMEI registration without writing stock',()=>{
 const h=harness({rfPosProductsV1:'[]',rfRefurbV1:'{broken'});h.submit(fields);
 assert.equal(h.data.get('rfPosProductsV1'),'[]');
 assert.match(h.messages.join(' '),/Refurbished-voorraad/);
});
test('IMEI normalization detects whitespace collision in existing POS catalog',()=>{
 const h=harness({rfPosProductsV1:JSON.stringify([{...product,imei:'1234'}])});h.submit(fields);
 assert.equal(JSON.parse(h.data.get('rfPosProductsV1')).length,1);
 assert.match(h.messages.join(' '),/IMEI\/serienummer bestaat al/);
});
test('corrupt refurbished storage cannot be silently replaced by a new record',()=>{
 const data=new Map([['rfRefurbV1','{broken']]),listeners={},messages=[];
 const fields={nrb:'Samsung',nrm:'S23',nri:'1234',nrser:'',nrp:'100',nrt:'Smartphone',nrs:'',nrc:'',nrsrc:'Leverancier',nrsup:'',nrcond:''};
 const document={getElementById:id=>fields[id]===undefined?null:{value:fields[id]},addEventListener:(name,fn)=>{listeners[name]=fn}};
 const localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app-refurb-v1.js'),'utf8'),{document,localStorage,window:{},toast:m=>messages.push(m),console:{log(){}},Date,Math,JSON});
 listeners.click({target:{closest:()=>({dataset:{rfb:'create'}})}});
 assert.equal(data.get('rfRefurbV1'),'{broken');
 assert.match(messages.join(' '),/beschadigd/);
});
test('repair part mutation preserves a corrupt stock journal',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../app-v3.js'),'utf8');
 const snippet=app.slice(app.indexOf("const RF_SHARED_PRODUCTS="),app.indexOf("let selected=",app.indexOf("const RF_SHARED_PRODUCTS=")));
 const data=new Map([['rfPosProductsV1',JSON.stringify([product])],['rfPosStockMovementsV1','{broken']]);
 const localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const result=vm.runInNewContext(snippet+'\nrfStockChange("P1",-1,"Repair","R1")',{localStorage,Date,Math,JSON,uid:()=> 'movement-id'});
 assert.equal(result,false);
 assert.equal(data.get('rfPosStockMovementsV1'),'{broken');
 assert.equal(JSON.parse(data.get('rfPosProductsV1'))[0].stock,1);
});
