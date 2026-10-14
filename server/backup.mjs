import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
const [mode,file,target]=process.argv.slice(2);
const source=process.env.DB_NAME;
const valid=n=>typeof n==='string'&&/^[a-zA-Z0-9_]{1,64}$/.test(n);
if(!valid(source)||!['backup','restore'].includes(mode)||mode==='restore'&&(!file||!valid(target)||target===source))throw Error('Usage: backup.mjs backup [file] OR restore file.sql NEW_DATABASE (different from DB_NAME)');
const config={host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT)||3306,user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||''};
const baseArgs=['--host='+config.host,'--port='+config.port,'--user='+config.user,'--default-character-set=utf8mb4'];
const bin=process.env.MYSQL_BIN_DIR||(process.platform==='win32'?'C:/xampp/mysql/bin':'');
const executable=name=>bin?path.join(bin,name+(process.platform==='win32'?'.exe':'')):name;
async function run(name,args,input,output){
 await new Promise((resolve,reject)=>{
  const child=spawn(executable(name),args,{env:{...process.env,MYSQL_PWD:config.password},windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stderr='';child.stderr.on('data',d=>{stderr+=d.toString().slice(0,2000);});child.on('error',reject);
  const stream=output?createWriteStream(output,{flags:'wx',mode:0o600}):null;
  if(stream){stream.on('error',e=>{child.kill();reject(e);});child.stdout.pipe(stream);}else child.stdout.resume();
  if(input){const reader=createReadStream(input);reader.on('error',e=>{child.kill();reject(e);});reader.pipe(child.stdin);}else child.stdin.end();
  child.stdin.on('error',()=>{});
  child.on('close',code=>{if(code!==0)return reject(Error(name+' failed: '+stderr.replaceAll(config.password||'\0','[redacted]')));if(stream&&!stream.writableFinished)stream.once('finish',resolve);else resolve();});
 });
}
const digest=async f=>createHash('sha256').update(await fs.readFile(f)).digest('hex');
if(mode==='backup'){
 const dest=path.resolve(file||'backups/appointment-'+new Date().toISOString().replaceAll(':','-')+'.sql');
 const root=path.resolve('.');if(dest.startsWith(path.join(root,'dist')+path.sep)||dest.startsWith(path.join(root,'public')+path.sep))throw Error('Backups must be stored outside served folders');
 await fs.mkdir(path.dirname(dest),{recursive:true});
 await run('mysqldump',[...baseArgs,'--single-transaction','--skip-lock-tables','--skip-add-drop-table',source],null,dest);
 await fs.writeFile(dest+'.json',JSON.stringify({version:1,database:source,createdAt:new Date().toISOString(),sha256:await digest(dest)},null,2),{flag:'wx',mode:0o600});
 console.log('Backup saved: '+dest);
}else{
 const manifest=JSON.parse(await fs.readFile(file+'.json','utf8'));if(manifest.version!==1||manifest.sha256!==await digest(file))throw Error('Backup checksum mismatch');
 const db=await mysql.createConnection(config);
 try{
  const [present]=await db.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[target]);
  if(present.length)throw Error('Restore requires a new database name. Existing databases are never overwritten.');
  await db.query('CREATE DATABASE '+mysql.escapeId(target)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await run('mysql',[...baseArgs,target],file);
  // A recovered instance must require fresh logins.
  await db.query('DELETE FROM '+mysql.escapeId(target)+'.sessions');
  await db.query("UPDATE "+mysql.escapeId(target)+".notification_outbox SET status='skipped' WHERE status<>'sent'");
  const [rows]=await db.query('SELECT COUNT(*) AS count FROM '+mysql.escapeId(target)+'.appointments');
  console.log('Restored '+rows[0].count+' appointments into '+target+'. Change DB_NAME only after verifying this database.');
 }finally{await db.end();}
}
