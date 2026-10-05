// Vite plugin: makes the legacy Orvalis page (../dist/test.html, built by the
// root project) available at /legacy/orvalis.html, both in the dev server and
// in the production build, so one site serves the bootstrap and both engines.
// The legacy page is copied as-is, never transformed.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LEGACY_SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'test.html');
const ROUTE = '/legacy/orvalis.html';

export function legacyPagePlugin() {
  return {
    name: 'orvalis-legacy-page',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0] !== ROUTE) return next();
        if (!existsSync(LEGACY_SOURCE)) {
          res.statusCode = 404;
          res.end('Legacy page missing: run `npm run build:prod` in the Orvalis root folder.');
          return;
        }
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(readFileSync(LEGACY_SOURCE));
      });
    },
    generateBundle() {
      if (!existsSync(LEGACY_SOURCE)) {
        this.error(`legacy page not found at ${LEGACY_SOURCE} — run \`npm run build:prod\` in the Orvalis root folder`);
      }
      this.emitFile({ type: 'asset', fileName: ROUTE.slice(1), source: readFileSync(LEGACY_SOURCE) });
    },
  };
}
