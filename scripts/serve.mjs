import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleProxyFetch} from './fetch-proxy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 4173);
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('请先运行 npm.cmd run build');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const server = http.createServer((req,res)=>{
  if(req.url?.startsWith('/__nai5_fetch')){void handleProxyFetch(req,res);return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  if(req.url==='/__nai5_health'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({app:'nai5-artist-roller',root,pid:process.pid,port}));return;}
  let requested;
  try{requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end('Invalid URL');return;}
  const file=path.resolve(dist,'.'+(requested==='/'?'/index.html':requested)), relative=path.relative(dist,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end();return;}
  fs.stat(file,(error,stat)=>{
    if(error||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD'){res.end();return;}
    fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  });
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已被占用，请关闭冲突程序或设置 PORT。`:e);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  fs.mkdirSync(path.join(root,'.runtime'),{recursive:true});
  fs.writeFileSync(path.join(root,'.runtime','server.json'),JSON.stringify({pid:process.pid,root,port,startedAt:new Date().toISOString()}));
  console.log(`NAI5 画师调配台：http://127.0.0.1:${port}/`);
});
