import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import net from 'node:net';
import { apiHandler } from '../server/api.mjs';
import { deliverVerification, verificationOrigin } from '../server/verification-mail.mjs';
import { accountStore } from '../server/accounts.mjs';

async function environment(values, fn) {
  const original = Object.fromEntries(Object.keys(values).map(key => [key,process.env[key]]));
  for (const [key,value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key]=value;
  try { return await fn(); }
  finally { for (const [key,value] of Object.entries(original)) value === undefined ? delete process.env[key] : process.env[key]=value; }
}

async function withApi(database, fn) {
  const server=createServer(apiHandler(database,{environment:'test'}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  try { await fn(base,post); } finally { await new Promise(resolve=>server.close(resolve)); }
}

test('Public registration cannot submit staff authority and rejects invalid details before any database work',async()=>{
  let databaseCalls=0;
  const store=accountStore(async()=>{databaseCalls++;throw Error('Unexpected database access');},async fn=>fn(),{});
  const valid={name:'Client',email:'client@example.test',phone:'09171234567',organization:'Individual',password:'ValidClientPassword123!'};
  for(const changes of [{role:'admin'},{role:'assistant'},{executiveId:'exec-1'},{active:true},{verified:true},{password:'short'},{email:'invalid'},{phone:'letters'},{organization:''}]){
    await assert.rejects(store.registerClient({...valid,...changes}),error=>error.status===400);
  }
  assert.equal(databaseCalls,0);
});

test('Client API forwards the authenticated identity for state, availability, saves and actions, and denies staff controls',async()=>{
  const user={id:'client-1',role:'client',name:'Client One'};
  const calls=[];
  const database={accounts:{session:async()=>user,preferences:async()=>({})},audit:{record:async()=>{}},
    state:async actor=>{calls.push(['state',actor]);return {appointments:[]};},
    availability:async(input,actor)=>{calls.push(['availability',actor]);return {available:true};},
    save:async(input,id,name,meta)=>{calls.push(['save',meta.user]);return {appointment:{id:'own'}};},
    action:async(id,action,input,name,meta)=>{calls.push(['action',meta.user]);return {appointment:{id}};},
  };
  await withApi(database,async(base,post)=>{
    assert.equal((await fetch(base+'/api/state')).status,200);
    assert.equal((await post('/api/availability',{})).status,200);
    assert.equal((await post('/api/appointments',{})).status,201);
    assert.equal((await post('/api/appointments/own/cancel',{})).status,200);
    for(const action of ['complete','approve','decline'])assert.equal((await post('/api/appointments/own/'+action,{})).status,403);
    assert.equal((await fetch(base+'/api/audit-logs')).status,403);
  });
  assert.deepEqual(calls.map(call=>call[0]),['state','availability','save','action']);
  assert.ok(calls.every(call=>call[1]===user));
});

test('Public verification endpoints use generic resend responses, return no raw tokens, and limit request attempts',async()=>{
  await environment({NODE_ENV:'development',REQUIRE_CLIENT_EMAIL_VERIFICATION:'true',SMTP_HOST:undefined,SMTP_FROM:undefined},async()=>{
    let registrations=0;
    const database={audit:{record:async()=>{}},accounts:{
      registerClient:async()=>{registrations++;return {email:'client@example.test',token:'a'.repeat(64)};},
      resendVerification:async()=>null,verifyClient:async()=>{},
    }};
    await withApi(database,async(base,post)=>{
      const res=await post('/api/auth/resend-verification',{email:'unknown@example.test'});
      assert.equal(res.status,200);assert.equal((await res.json()).developmentVerificationUrl,undefined);
      const registered=await post('/api/auth/register',{});assert.equal(registered.status,201);
      const data=await registered.json();assert.equal(data.token,undefined);assert.equal(data.user,undefined);
      assert.equal(data.developmentVerificationUrl,base+'/#verify='+'a'.repeat(64));
      for(let i=0;i<4;i++)assert.equal((await post('/api/auth/register',{})).status,201);
      assert.equal((await post('/api/auth/register',{})).status,429);assert.equal(registrations,5);
    });
  });
});

test('Production registration requires SMTP when verification is enabled and never exposes a development verification link',async()=>{
  await environment({NODE_ENV:'production',REQUIRE_CLIENT_EMAIL_VERIFICATION:'true',SMTP_HOST:undefined,SMTP_FROM:undefined,PUBLIC_ORIGIN:'https://appointments.example.test'},async()=>{
    let created=false;
    const database={accounts:{registerClient:async()=>{created=true;}},audit:{record:async()=>{}}};
    await withApi(database,async(base,post)=>{
      const response=await post('/api/auth/register',{});assert.equal(response.status,503);
      assert.equal((await response.json()).developmentVerificationUrl,undefined);assert.equal(created,false);
    });
    await assert.rejects(deliverVerification('client@example.test','secret','https://appointments.example.test'),error=>error.status===503);
    assert.equal(verificationOrigin({headers:{host:'attacker.example.test'}}),'https://appointments.example.test');
  });
  await environment({NODE_ENV:'development'},async()=>{
    assert.throws(()=>verificationOrigin({headers:{host:'attacker.example.test'},socket:{}}),/configured application address/);
    assert.equal(verificationOrigin({headers:{host:'127.0.0.1:5173'},socket:{}}),'http://127.0.0.1:5173');
  });
});

test('Registration without verification returns a user and private session cookie, skips email, and remains rate limited',async()=>{
  for (const mode of ['development','production']) await environment({NODE_ENV:mode,REQUIRE_CLIENT_EMAIL_VERIFICATION:undefined,SMTP_HOST:undefined,SMTP_FROM:undefined},async()=>{
    const user={id:'client-1',role:'client',name:'Client One',emailVerified:false};
    const token='c'.repeat(64);let registrations=0;
    const database={audit:{record:async()=>{}},accounts:{
      registerClient:async()=>{registrations++;return {user,token};},
      resendVerification:async()=>{throw Error('Verification must not be requested');},
    }};
    await withApi(database,async(base,post)=>{
      assert.deepEqual(await (await fetch(base+'/api/auth/config')).json(),{verificationRequired:false});
      const response=await post('/api/auth/register',{});assert.equal(response.status,201);
      assert.deepEqual(await response.json(),{verificationRequired:false,user});
      const cookie=response.headers.get('set-cookie');
      assert.ok(cookie.startsWith('appointment_test_session='+token+';'));
      assert.match(cookie,/HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800/);
      assert.equal(cookie.includes('; Secure'),mode==='production');
      const resent=await post('/api/auth/resend-verification',{email:user.email});
      assert.equal(resent.status,200);assert.equal((await resent.json()).verificationRequired,false);
      for(let i=0;i<4;i++)assert.equal((await post('/api/auth/register',{})).status,201);
      assert.equal((await post('/api/auth/register',{})).status,429);assert.equal(registrations,5);
    });
  });
});

test('Verification email reaches a local SMTP capture without returning a token or development URL',async()=>{
  const messages=[];
  const smtp=net.createServer(socket=>{
    socket.setEncoding('utf8');socket.write('220 localhost test SMTP\r\n');
    let buffer='',data=false;
    socket.on('data',chunk=>{
      buffer+=chunk;
      while(buffer.length){
        if(data){const end=buffer.indexOf('\r\n.\r\n');if(end<0)return;messages.push(buffer.slice(0,end));buffer=buffer.slice(end+5);data=false;socket.write('250 accepted\r\n');continue;}
        const end=buffer.indexOf('\r\n');if(end<0)return;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(/^(EHLO|HELO)/i.test(line))socket.write('250-localhost\r\n250 8BITMIME\r\n');
        else if(/^DATA$/i.test(line)){data=true;socket.write('354 end with dot\r\n');}
        else if(/^QUIT$/i.test(line)){socket.end('221 bye\r\n');return;}
        else socket.write('250 ok\r\n');
      }
    });socket.on('error',()=>{});
  });
  await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));
  try{
    await environment({NODE_ENV:'development',SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.address().port),SMTP_FROM:'office@example.test',SMTP_SECURE:'false',SMTP_USER:undefined,SMTP_PASSWORD:undefined},async()=>{
      const result=await deliverVerification('client@example.test','b'.repeat(64),'http://127.0.0.1:5173');
      assert.deepEqual(result,{});assert.equal(messages.length,1);
      const message=messages[0].replace(/=\r\n/g,'').replaceAll('=3D','=');
      assert.match(message,/To: client@example.test/);
      assert.ok(message.includes('http://127.0.0.1:5173/#verify='+'b'.repeat(64)));
    });
  }finally{await new Promise(resolve=>smtp.close(resolve));}
});
