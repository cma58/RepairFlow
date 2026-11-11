#!/usr/bin/env node
'use strict';
// One-time owner setup for the REAL Neon Auth provider E2E (draft PR #28).
// Runs on the owner's computer (Node 18+ and a logged-in GitHub CLI `gh`).
//
// What it does, only against the reviewed isolated targets pinned in
// tests/provider/isolated-target.js:
//  1. Activates the synthetic test account through the OFFICIAL Neon Auth flow:
//     password-reset OTP by e-mail (/forget-password/email-otp → /email-otp/reset-password),
//     plus e-mail verification OTP if the provider asks for it.
//  2. Generates the password itself. It is never shown, logged or passed as a
//     command-line argument; it only goes to the provider and to GitHub via stdin.
//  3. Proves a real sign-in, then signs out again.
//  4. Writes the nine provider secrets to GitHub environment `neon-auth-e2e`
//     (and optionally the Vercel automation bypass as repository secret).
//  5. Re-runs the provider workflow on the test branch.
// The account has no PHIXAR staff row or membership: expected role is `none`.
//
// Usage:  node scripts/provider-e2e-setup.js
const crypto=require('node:crypto');const readline=require('node:readline');const {spawnSync}=require('node:child_process');
const {AUTH,ORIGIN,EMAIL,assertIsolatedTarget}=require('../tests/provider/isolated-target');
const REPO='cma58/RepairFlow',ENV='neon-auth-e2e',BRANCH='test/p0-webauthn-browser-e2e-recovery',WORKFLOW='neon-auth-provider-e2e.yml';
const ORG='11111111-1111-4111-8111-111111111111',BRANCH_ID='22222222-2222-4222-8222-222222222222';

function buildSecrets({password,runtimeDatabaseUrl}){
 const s={PHIXAR_E2E_ENVIRONMENT:'isolated',PHIXAR_E2E_NEON_AUTH_URL:AUTH,PHIXAR_E2E_TRUSTED_ORIGIN:ORIGIN,PHIXAR_E2E_USER_EMAIL:EMAIL,
  PHIXAR_E2E_USER_PASSWORD:password,PHIXAR_E2E_RUNTIME_DATABASE_URL:runtimeDatabaseUrl,PHIXAR_E2E_ORGANIZATION_ID:ORG,
  PHIXAR_E2E_BRANCH_ID:BRANCH_ID,PHIXAR_E2E_EXPECTED_ROLE:'none'};
 assertIsolatedTarget(s);
 let u;try{u=new URL(runtimeDatabaseUrl)}catch{throw Error('runtime database URL is not a URL')}
 if(decodeURIComponent(u.username)!=='rf_runtime_login'||!u.password)throw Error('runtime database URL must use role rf_runtime_login (never the owner role)');
 if(typeof password!=='string'||password.length<16)throw Error('password too short');
 return s;
}
function ask(question,{hidden=false}={}){
 return new Promise(resolve=>{
  const rl=readline.createInterface({input:process.stdin,output:process.stdout,terminal:true});
  if(hidden){const write=rl._writeToOutput.bind(rl);rl._writeToOutput=s=>{if(s.includes(question))write(question);else if(s!=='\r\n'&&s!=='\n')write('')}}
  rl.question(question,a=>{rl.close();if(hidden)process.stdout.write('\n');resolve(a.trim())});
 });
}
async function auth(path,{body,cookie,method='POST'}={}){
 const headers={Accept:'application/json',Origin:ORIGIN};if(body)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;
 const r=await fetch(AUTH+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 let json=null;try{json=await r.json()}catch{}
 return {status:r.status,json,setCookie:r.headers.getSetCookie()};
}
function sessionCookieFrom(lines){const l=lines.find(x=>/session_token=[^;]{8,}/.test(x));return l?l.split(';')[0]:null}
function gh(args,input){
 const r=spawnSync('gh',args,{input,encoding:'utf8'});
 if(r.status!==0)throw Error('gh '+args.slice(0,3).join(' ')+' failed: '+String(r.stderr||r.error||'').trim().split('\n')[0]);
 return r.stdout.trim();
}
function step(n,text){process.stdout.write(`\n[${n}] ${text}\n`)}
function fail(text,r){throw Error(text+(r?` (HTTP ${r.status}${r.json?.code?' '+r.json.code:''})`:''))}

async function main(){
 if(typeof fetch!=='function')throw Error('Node 18 or newer is required');
 step(1,'Controle GitHub CLI en rechten');
 gh(['auth','status']);
 if(gh(['api','repos/'+REPO,'--jq','.permissions.admin'])!=='true')throw Error('je GitHub-account heeft geen beheerrechten op '+REPO);
 console.log('    OK. Doel Neon Auth: '+new URL(AUTH).host+'\n    Testaccount: '+EMAIL+' (geen rol in PHIXAR)');

 step(2,'Beperkte databaseverbinding van de geïsoleerde testbranch');
 console.log('    Plak de waarde van REPAIRFLOW_RUNTIME_DATABASE_URL (rol rf_runtime_login) uit Vercel →\n    repair-flow → Settings → Environment Variables (Preview, branch '+BRANCH+').\n    Invoer blijft onzichtbaar.');
 const runtimeDatabaseUrl=await ask('    Runtime-URL: ',{hidden:true});
 buildSecrets({password:'x'.repeat(16),runtimeDatabaseUrl});
 console.log('    OK: host en rol horen bij de geïsoleerde testbranch.');
 const bypass=await ask('    Optioneel: Vercel "Protection Bypass for Automation" (Enter = overslaan): ',{hidden:true});

 step(3,'Officiële Neon Auth-reset: OTP aanvragen');
 const sent=await auth('/forget-password/email-otp',{body:{email:EMAIL}});
 if(sent.status!==200)fail('reset-OTP aanvragen mislukt',sent);
 console.log('    Code verstuurd naar '+EMAIL+' (afzender Neon Auth, 15 min geldig).');
 const otp=await ask('    Code uit de e-mail: ');
 const password=crypto.randomBytes(24).toString('base64url');
 const reset=await auth('/email-otp/reset-password',{body:{email:EMAIL,otp,password}});
 if(reset.status!==200)fail('wachtwoord instellen via provider mislukt',reset);
 console.log('    Wachtwoord via de provider ingesteld (niet getoond).');

 step(4,'Echte login controleren');
 let login=await auth('/sign-in/email',{body:{email:EMAIL,password}});
 if(login.status===403&&/EMAIL_NOT_VERIFIED/i.test(login.json?.code||'')){
  console.log('    De provider vraagt e-mailverificatie; er is een tweede code verstuurd.');
  const code=await ask('    Verificatiecode uit de e-mail: ');
  const v=await auth('/email-otp/verify-email',{body:{email:EMAIL,otp:code}});
  if(v.status!==200)fail('e-mailverificatie mislukt',v);
  login=await auth('/sign-in/email',{body:{email:EMAIL,password}});
 }
 const cookie=sessionCookieFrom(login.setCookie);
 if(login.status!==200||!cookie)fail('login mislukt',login);
 const session=await auth('/get-session',{method:'GET',cookie});
 if(session.status!==200||session.json?.user?.email?.toLowerCase()!==EMAIL)fail('sessie niet bevestigd',session);
 await auth('/sign-out',{body:{},cookie});
 console.log('    Echte login geslaagd en weer afgemeld.');

 step(5,'GitHub-environment '+ENV+' en secrets');
 gh(['api','-X','PUT','repos/'+REPO+'/environments/'+ENV]);
 const secrets=buildSecrets({password,runtimeDatabaseUrl});
 for(const [name,value] of Object.entries(secrets)){gh(['secret','set',name,'--env',ENV,'--repo',REPO],value);console.log('    gezet: '+name)}
 if(bypass){gh(['secret','set','PHIXAR_E2E_VERCEL_BYPASS','--repo',REPO],bypass);console.log('    gezet: PHIXAR_E2E_VERCEL_BYPASS (repository)')}

 step(6,'Provider-workflow opnieuw starten');
 const id=gh(['run','list','--repo',REPO,'--workflow',WORKFLOW,'--branch',BRANCH,'--limit','1','--json','databaseId','--jq','.[0].databaseId']);
 if(id){gh(['run','rerun',id,'--repo',REPO]);console.log('    Gestart: https://github.com/'+REPO+'/actions/runs/'+id)}
 console.log('\nKlaar. Geen wachtwoord of verbinding is opgeslagen op deze computer.');
}
if(require.main===module)main().catch(e=>{process.stderr.write('\nGestopt: '+e.message+'\n');process.exit(1)});
module.exports={buildSecrets};
