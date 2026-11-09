'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {requireCurrentSession}=require('../lib/session-guard');
const org='11111111-1111-4111-8111-111111111111',id='99999999-9999-4999-8999-999999999999',identity={subject:'synthetic',sessionId:id,createdAt:'2026-11-09T10:00:00Z'};
test('re-checks exact session and enterprise before protected operation',async()=>{let args;await requireCurrentSession({query:async(sql,params)=>{assert.match(sql,/rf_session_denials/);args=params;return {rows:[]}}},identity,org);assert.deepEqual(args,[org,'synthetic',id,identity.createdAt])});
test('denied session and missing verified session ID fail closed',async()=>{await assert.rejects(()=>requireCurrentSession({query:async()=>({rows:[{one:1}]})},identity,org),{code:'ACCESS_DENIED'});await assert.rejects(()=>requireCurrentSession({query:async()=>{throw Error('must not read')}},{subject:'synthetic'},org),{code:'ACCESS_DENIED'})});
