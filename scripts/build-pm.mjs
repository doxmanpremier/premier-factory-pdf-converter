import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import fs from 'node:fs';
import zlib from 'node:zlib';
fs.mkdirSync('public/ocr/core',{recursive:true});fs.mkdirSync('public/ocr/lang',{recursive:true});
fs.copyFileSync('node_modules/tesseract.js/dist/worker.min.js','public/ocr/worker.min.js');
for(const name of fs.readdirSync('node_modules/tesseract.js-core').filter(name=>/^tesseract-core.*\.(?:js|wasm)$/.test(name)))fs.copyFileSync('node_modules/tesseract.js-core/'+name,'public/ocr/core/'+name);
if(!fs.existsSync('public/ocr/lang/eng.traineddata.gz')&&fs.existsSync('.sites-runtime/eng.traineddata'))fs.writeFileSync('public/ocr/lang/eng.traineddata.gz',zlib.gzipSync(fs.readFileSync('.sites-runtime/eng.traineddata')));
if(!fs.existsSync('public/ocr/lang/eng.traineddata.gz'))throw Error('Missing bundled English OCR language data.');
await build({entryPoints:['pm/main.tsx'],bundle:true,outfile:'public/pm-bundle.js',platform:'browser',format:'iife',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
// Serve the PM page through the authenticated Worker, never the static asset router.
if(fs.existsSync('public/pm.html'))fs.unlinkSync('public/pm.html');

// Reuse the converter's bundled PDF renderer and worker for authenticated thumbnails.
const scripts=[...fs.readFileSync('public/converter.html','utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
fs.writeFileSync('public/pm-pdf.worker.js',scripts[0]);
fs.writeFileSync('public/pm-pdf.js',scripts[1]);

const version=createHash('sha256').update(fs.readFileSync('public/pm-bundle.js')).update(fs.readFileSync('public/pm-bundle.css')).digest('hex').slice(0,16);
fs.writeFileSync('worker/pm-assets.ts','export const pmAssetVersion='+JSON.stringify(version)+';\n');
