'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {invited}=require('../lib/login-invitations');
test('only configured addresses are invited; no configuration denies all',()=>{const env={REPAIRFLOW_LOGIN_INVITED_EMAILS:'first@example.test, second@example.test'};assert.equal(invited('SECOND@example.test',env),true);assert.equal(invited('other@example.test',env),false);assert.equal(invited('first@example.test',{}),false)});
test('overlong or malformed configuration fails closed',()=>{assert.equal(invited('a@example.test',{REPAIRFLOW_LOGIN_INVITED_EMAILS:'x'.repeat(5001)}),false);assert.equal(invited('a'.repeat(255),{REPAIRFLOW_LOGIN_INVITED_EMAILS:'a'.repeat(255)}),false)});
