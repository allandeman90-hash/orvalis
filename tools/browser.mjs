import {pathToFileURL} from 'node:url';
import path from 'node:path';
// Prefer a project installation. Codex's bundled runtime is an optional local fallback.
let api;
try { api=await import(process.env.PLAYWRIGHT || 'playwright'); }
catch(e){
 const home=process.env.USERPROFILE||process.env.HOME;
 if(!home)throw e;
 api=await import(pathToFileURL(path.join(home,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
}
export const chromium=api.chromium;
