/* ============================================================================
 * FacturaBot · Servidor estático
 * ----------------------------------------------------------------------------
 * Sirve el proyecto para poder abrir el reporte en el navegador:
 *
 *   node tools/servidor.mjs [puerto]
 *
 *   → http://localhost:8080/assets/reporte-lote.html
 *
 * No usa dependencias externas: solo `node:http` + `node:fs`.
 * ========================================================================== */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PUERTO = Number(process.argv[2] ?? 8080);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

const servidor = createServer((peticion, respuesta) => {
  const url = new URL(peticion.url, `http://localhost:${PUERTO}`);
  let ruta = decodeURIComponent(url.pathname);

  if (ruta === '/') ruta = '/assets/reporte-lote.html';

  // Evita salir de la raíz del proyecto.
  const destino = join(RAIZ, normalize(ruta).replace(/^([/\\])+/, ''));
  if (!destino.startsWith(RAIZ)) {
    respuesta.writeHead(403).end('403 · Ruta no permitida');
    return;
  }

  if (!existsSync(destino) || !statSync(destino).isFile()) {
    respuesta.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    respuesta.end(
      `<h1 style="font-family:sans-serif;background:#070B14;color:#E9EFFA;padding:40px">
         404 · No existe <code>${ruta}</code><br><br>
         <a style="color:#2DD4BF" href="/assets/reporte-lote.html">Ir al reporte del lote</a>
       </h1>`,
    );
    return;
  }

  respuesta.writeHead(200, {
    'Content-Type': TIPOS[extname(destino).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(destino).pipe(respuesta);
});

servidor.listen(PUERTO, () => {
  console.log(`\n  FacturaBot · servidor estático`);
  console.log(`  Raíz:  ${RAIZ}`);
  console.log(`  Reporte: http://localhost:${PUERTO}/assets/reporte-lote.html`);
  console.log(`  Workflow: http://localhost:${PUERTO}/workflow.json\n`);
});
