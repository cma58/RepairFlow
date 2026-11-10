'use strict';
// Dependency injection for isolated tests only. A Symbol-keyed marker cannot be
// produced from HTTP input or JSON, so production invocations handler(req,res)
// and any unexpected runtime argument always fall back to real defaults.
const MARK=Symbol.for('phixar.isolated-test-deps');
function testDeps(deps){return deps&&typeof deps==='object'&&deps[MARK]===true?deps:undefined}
function markTestDeps(deps){return Object.freeze({...deps,[MARK]:true})}
module.exports={testDeps,markTestDeps,MARK};
