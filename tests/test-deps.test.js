'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {testDeps,markTestDeps}=require('../lib/test-deps');
test('test dependencies are honored only with the unforgeable Symbol marker',()=>{
 assert.equal(testDeps(undefined),undefined);
 assert.equal(testDeps({env:{},authenticate:()=>({subject:'x'})}),undefined,'a plain runtime object can never override authentication');
 assert.equal(testDeps(JSON.parse('{"env":{}}')),undefined);
 const marked=markTestDeps({env:{A:'1'}});assert.equal(testDeps(marked),marked);assert.ok(Object.isFrozen(marked));
});
