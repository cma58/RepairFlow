'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('prepared document becomes visible and printable, rather than staying permanently hidden',()=>{
 const source=fs.readFileSync(require.resolve('../workspace.js'),'utf8');const header=source.slice(source.indexOf('function printHeader('),source.indexOf('\nfunction printNotice('));
 const root={hidden:true,children:[],replaceChildren(){this.children=[]},append(el){this.children.push(el)}};
 const calls=[];const context={document:{createElement:tag=>({tag,textContent:''})},$:id=>{assert.equal(id,'print-document');return root},printLine:(...args)=>calls.push(args)};vm.createContext(context);vm.runInContext(header,context);
 context.printHeader('Verkoopoverzicht',{organization:{name:'Synthetic organization'},branch:{name:'Synthetic branch',address:'Test address'}});
 assert.equal(root.hidden,false);assert.equal(root.children[0].textContent,'Verkoopoverzicht');assert.equal(calls.length,3);
});
