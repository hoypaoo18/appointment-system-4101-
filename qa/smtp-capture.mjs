import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs/promises';
await fs.mkdir('qa/evidence-current',{recursive:true});
const messages=[];
const smtp=net.createServer(socket=>{
 socket.setEncoding('utf8');socket.write('220 localhost SQA SMTP ready\r\n');let buffer='',dataMode=false,envelope={from:'',to:[]};
 socket.on('data',chunk=>{buffer+=chunk;while(buffer.length){
  if(dataMode){const end=buffer.indexOf('\r\n.\r\n');if(end<0)return;const raw=buffer.slice(0,end);buffer=buffer.slice(end+5);messages.push({timestamp:new Date().toISOString(),...envelope,raw});void fs.writeFile('qa/evidence-current/smtp-messages.json',JSON.stringify(messages,null,2));envelope={from:'',to:[]};dataMode=false;socket.write('250 Message accepted\r\n');continue;}
  const end=buffer.indexOf('\r\n');if(end<0)return;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
  if(/^(EHLO|HELO)/i.test(line))socket.write('250-localhost\r\n250 8BITMIME\r\n');
  else if(/^MAIL FROM:/i.test(line)){envelope.from=line.slice(10).trim();socket.write('250 OK\r\n');}
  else if(/^RCPT TO:/i.test(line)){envelope.to.push(line.slice(8).trim());socket.write('250 OK\r\n');}
  else if(/^DATA$/i.test(line)){dataMode=true;socket.write('354 End with dot\r\n');}
  else if(/^QUIT$/i.test(line)){socket.end('221 Bye\r\n');return;}
  else socket.write('250 OK\r\n');
 }});socket.on('error',()=>{});
});
smtp.listen(2525,'127.0.0.1');
const api=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(messages));});api.listen(8025,'127.0.0.1',()=>console.log('Local SMTP capture ready: 2525; captured messages: 8025'));
