'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../login.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
async function renderLogin({query='',sessionStatus=200,sessionAuthenticated=true,staffStatus=200,role='manager'}={}){
 const status={textContent:''},form={hidden:true,addEventListener(){}},email={value:''},button={disabled:false},link={hidden:true};
 const requests=[];
 const response=(code,body)=>({ok:code>=200&&code<300,status:code,json:async()=>body});
 const context={URLSearchParams,location:{origin:'https://preview.example',pathname:'/login',search:query,replace(){}},
  history:{replaceState(){}},document:{getElementById(id){return {status,login:form,email,send:button,'workspace-link':link}[id]}},
  fetch:async url=>{requests.push(url);if(url==='/api/auth/session')return response(sessionStatus,{authenticated:sessionAuthenticated});
   if(url==='/api/auth/me')return response(staffStatus,{role});
   if(url==='/api/auth/status')return response(200,{authentication:{loginEnabled:true}});
   throw Error('Unexpected request: '+url)}
 };
 vm.runInNewContext(script,context);
 for(let n=0;n<6;n++)await new Promise(resolve=>setImmediate(resolve));
 return {status:status.textContent,formHidden:form.hidden,linkHidden:link.hidden,requests};
}
test('magic link return exchanges verifier before any login readiness request',()=>{
 assert.match(html,/params\.has\('neon_auth_session_verifier'\)/);
 assert.match(html,/location\.replace\('\/api\/auth\/callback\?neon_auth_session_verifier='/);
 assert.match(html,/if\(!returningFromAuth\)checkSession\(\)/);
});
test('callback status is not overwritten by asynchronous readiness',()=>{
 assert.match(html,/if\(params\.has\('auth_return'\)\)/);
 assert.match(html,/checkSession\(\)/);
 assert.match(html,/fetch\('\/api\/auth\/me',\{method:'GET',credentials:'same-origin'/);
 assert.match(html,/staffResponse\.ok/);
});
test('refresh retains verified manager state instead of showing login form',async()=>{
 const page=await renderLogin();
 assert.match(page.status,/medewerkersrechten bevestigd \(manager\)/);
 assert.equal(page.formHidden,true);
 assert.equal(page.linkHidden,false);
 assert.deepEqual(page.requests,['/api/auth/session','/api/auth/me']);
});
test('anonymous visitor sees login, provider outage fails closed',async()=>{
 const anonymous=await renderLogin({sessionStatus:401,sessionAuthenticated:false});
 assert.equal(anonymous.formHidden,false);
 assert.deepEqual(anonymous.requests,['/api/auth/session','/api/auth/status']);
 const unavailable=await renderLogin({sessionStatus:503,sessionAuthenticated:false});
 assert.equal(unavailable.formHidden,true);
 assert.match(unavailable.status,/sessie kan niet worden gecontroleerd/);
 assert.deepEqual(unavailable.requests,['/api/auth/session']);
});
test('callback checks session before any readiness request',async()=>{
 const page=await renderLogin({query:'?auth_return=1'});
 assert.match(page.status,/medewerkersrechten bevestigd/);
 assert.deepEqual(page.requests,['/api/auth/session','/api/auth/me']);
});
