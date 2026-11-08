#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const {analyzeBackup}=require('../lib/legacy-import-preflight');
if(process.argv.length!==3){process.stderr.write('Gebruik: node scripts/preflight-legacy-backup.js /pad/naar/backup.json\n');process.exitCode=2}
else try{const result=analyzeBackup(fs.readFileSync(process.argv[2]));process.stdout.write(JSON.stringify(result,null,2)+'\n');if(result.errors.length)process.exitCode=1}
catch{process.stderr.write('Back-up kon niet worden gelezen. Er is niets gewijzigd.\n');process.exitCode=2}
