import {spawnSync} from 'node:child_process';
import mysql from 'mysql2/promise';
import {openDatabase} from '../server/database.mjs';
import assert from 'node:assert/strict';
const source='appointment_qa_ead4325975904a71b8b71c1473ebea50',target=source+'_restored';
process.env.APP_ENV='test';process.env.DB_NAME=source;process.env.NODE_ENV='development';
const admin=await mysql.createConnection({host:'127.0.0.1',user:'root',password:''});
for(const name of [source,target]){const [r]=await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[name]);if(r.length)throw Error('Refusing to overwrite existing QA database');}
let db;
const run=args=>{const r=spawnSync(process.execPath,['server/backup.mjs',...args],{env:process.env,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr);console.log(r.stdout.trim());};
try{
 db=await openDatabase();const before=await db.state();await db.close();db=null;
 run(['backup','backups/qa-restore-verification.sql']);run(['restore','backups/qa-restore-verification.sql',target]);
 const [rows]=await admin.query('SELECT data FROM '+mysql.escapeId(target)+'.appointments ORDER BY date,start_min,id');assert.equal(rows.length,before.appointments.length);
 const [sessions]=await admin.query('SELECT COUNT(*) AS n FROM '+mysql.escapeId(target)+'.sessions');assert.equal(sessions[0].n,0);
 console.log('PASS: backup checksum, full database restore, appointment count, fresh sessions');
}finally{if(db)await db.close();for(const name of [target,source])await admin.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await admin.end();}
