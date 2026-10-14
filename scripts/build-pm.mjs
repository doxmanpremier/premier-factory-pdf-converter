import {build} from 'esbuild';
import fs from 'node:fs';
await build({entryPoints:['pm/main.tsx'],bundle:true,outfile:'public/pm-bundle.js',platform:'browser',format:'iife',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
// Serve the PM page through the authenticated Worker, never the static asset router.
if(fs.existsSync('public/pm.html'))fs.unlinkSync('public/pm.html');
