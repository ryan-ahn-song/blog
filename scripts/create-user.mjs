import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { hashPassword } from '../apps/backend/src/password.ts';
const remote=process.argv.includes('--remote');
if(!remote&&!process.argv.includes('--local'))throw new Error('Specify --local or --remote explicitly.');
let input;
if(process.stdin.isTTY){
  let muted=false;
  const output=new Writable({write(chunk,_encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
  const rl=createInterface({input:process.stdin,output,terminal:true});
  const email=await rl.question('Email: ');const name=await rl.question('Display name: ');
  process.stdout.write('Password (hidden): ');muted=true;const password=await rl.question('');muted=false;process.stdout.write('\n');
  process.stdout.write('Repeat password (hidden): ');muted=true;const repeat=await rl.question('');muted=false;process.stdout.write('\n');rl.close();
  if(password!==repeat)throw new Error('Passwords do not match.');input={email,name,password};
}else{let value='';for await(const chunk of process.stdin)value+=chunk;input=JSON.parse(value);}
const email=input.email?.trim().toLowerCase(),name=input.name?.trim(),password=input.password;
if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||name.length>80||typeof password!=='string'||password.length<12||password.length>256)throw new Error('Use a valid email, a display name (1–80 characters), and a password (12–256 characters).');
const hash=await hashPassword(password);input.password='';
const quote=value=>`'${value.replaceAll("'","''")}'`;
const dir=await mkdtemp(join(tmpdir(),'ark-account-'));
const cli=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
const cwd=fileURLToPath(new URL('../apps/backend',import.meta.url));
try{
  const sql=join(dir,'account.sql');
  await writeFile(sql,`INSERT INTO auth_users(id,email,name,password_hash,role) VALUES(${quote(randomUUID())},${quote(email)},${quote(name)},${quote(hash)},'${process.argv.includes('--admin')?'admin':'author'}');`,{mode:0o600});
  const result=spawnSync(process.execPath,[cli,'d1','execute','DB',remote?'--remote':'--local','--file',sql],{cwd,stdio:'inherit'});
  if(result.status!==0)process.exitCode=result.status??1;
  else console.log(`Account created: ${email} (${remote?'remote':'local'}).`);
}finally{await rm(dir,{recursive:true,force:true});}
