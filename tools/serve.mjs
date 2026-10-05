import http from 'node:http';
import fs from 'node:fs';
const file=new URL('../dist/Jouer-Orvalis.html',import.meta.url),port=Number(process.env.PORT||8766);
http.createServer((req,res)=>{if(req.url!=='/'&&req.url!=='/Jouer-Orvalis.html'){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);}).listen(port,'127.0.0.1',()=>console.log(`Orvalis: http://127.0.0.1:${port}/`));
