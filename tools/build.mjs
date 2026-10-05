// Construit dist/orvalis.html (page de l'artifact, sans squelette) et dist/test.html (page autonome pour les tests).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prod = process.argv.includes('--prod');

const t0 = Date.now();
const sourceFiles=[];
function collect(dir){for(const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const p=dir+'/'+item.name;if(item.isDirectory())collect(p);else sourceFiles.push(p);}}
collect('src');sourceFiles.push('package.json','package-lock.json','tools/build.mjs');sourceFiles.sort();
const sourceDigest=createHash('sha256');for(const p of sourceFiles){sourceDigest.update(p+'\0');sourceDigest.update(fs.readFileSync(path.join(root,p)));}
const buildInfo={version:'4.0.0',worldVersion:2,sourceHash:sourceDigest.digest('hex'),mode:prod?'production':'development',builtAt:new Date().toISOString()};
const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: prod,
  sourcemap: false,
  target: ['es2020'],
  legalComments: 'none',
  write: false,
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: prod ? 'false' : 'true' },
});
let js = 'window.__build='+JSON.stringify(buildInfo)+';\n'+result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'src/ui/style.css'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'src/ui/shell.html'), 'utf8');
const fonts = 'https://fonts.googleapis.com/css2?family=Grenze+Gotisch:wght@500;700;800&family=Barlow+Semi+Condensed:ital,wght@0,400;0,500;0,600;0,700;1,500&display=swap';

const page = `<title>Orvalis Online</title>
<meta name="description" content="MMORPG 3D dans le navigateur : deux factions en guerre, huit classes, quêtes, donjons, raids, familiers et JcJ.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style>
${css}
</style>
${shell}
<script>
${js}
</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/orvalis.html'), page);
fs.writeFileSync(path.join(root, 'dist/test.html'), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>
${page}</body></html>`);
const kb = (fs.statSync(path.join(root, 'dist/orvalis.html')).size / 1024).toFixed(0);
fs.copyFileSync(path.join(root,'dist/test.html'),path.join(root,'dist/Jouer-Orvalis.html'));
fs.writeFileSync(path.join(root,'dist/build-info.json'),JSON.stringify({...buildInfo,sourceFiles},null,2));
console.log(`build ${prod ? 'prod' : 'dev'} ok — ${kb} Ko en ${Date.now() - t0} ms`);
