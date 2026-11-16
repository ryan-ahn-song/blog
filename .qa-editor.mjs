import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {createServer} from 'vite';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('./apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'isolated-editor-ui'},r2Buckets:['MEDIA']}));
const db=await mf.getD1Database('DB');
for(const file of (await readdir(new URL('./apps/backend/migrations',import.meta.url))).filter(file=>file.endsWith('.sql')).sort()){
 const sql=await readFile(new URL('./apps/backend/migrations/'+file,import.meta.url),'utf8');for(const statement of sql.split(';').filter(value=>value.trim()))await db.prepare(statement).run();
}
await db.prepare("INSERT INTO auth_users(id,email,name,role) VALUES('editor-qa','editor-qa@example.invalid','검토용 작성자','author')").run();
const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),'editor-qa',Math.floor(Date.now()/1000)+3600).run();
const server=await createServer({root:fileURLToPath(new URL('./apps/frontend',import.meta.url)),server:{host:'localhost',port:3001,strictPort:true},plugins:[{name:'isolated-editor-api',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(req.url==='/qa/start'){res.writeHead(302,{'Set-Cookie':'ark_session='+token+'; Path=/; HttpOnly; SameSite=Lax',Location:'/'});res.end();return;}
 if(!req.url?.startsWith('/api/')){next();return;}
 try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const response=await mf.dispatchFetch('http://localhost:3001'+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})});res.statusCode=response.status;for(const[key,value]of response.headers)res.setHeader(key,value);res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":"Isolated test request failed"}');}
 });}}]});
await server.listen();console.log('Isolated editor UI ready: http://localhost:3001/qa/start');
setInterval(()=>{},60000);
