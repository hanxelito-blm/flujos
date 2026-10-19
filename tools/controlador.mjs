/* ============================================================================
 * FacturaBot · Controlador de servidores
 * ----------------------------------------------------------------------------
 * Levanta y detiene los servicios del proyecto desde el navegador.
 *
 *   node tools/controlador.mjs [puerto-control]      →  http://localhost:8090
 *
 * API:
 *   GET  /api/estado        → estado de puertos y procesos
 *   POST /api/servicio       → { servicio, accion: 'iniciar' | 'detener' }
 *   POST /api/liberar        → { puerto }  (libera un puerto ocupado)
 *   GET  /reporte            → el reporte HTML (siempre disponible)
 *
 * La API responde con CORS abierto para que control.html también funcione
 * abierto directamente desde el disco (file://).
 * ========================================================================== */

import { spawn, execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PUERTO_CONTROL = Number(process.argv[2] ?? 8090);

/* ---------------------------------------------------------------------------
 * Servicios que este panel administra
 * ------------------------------------------------------------------------ */
const SERVICIOS = {
  web: {
    nombre: 'Servidor del reporte',
    detalle: 'node tools/servidor.mjs 8080',
    puerto: 8080,
    comando: 'node',
    args: ['tools/servidor.mjs', '8080'],
    url: 'http://localhost:8080/assets/reporte-lote.html',
  },
  n8n: {
    nombre: 'n8n (instancia aislada)',
    detalle: 'N8N_PORT=5680 · broker 5681 · N8N_USER_FOLDER=.n8n-local',
    puerto: 5680,
    comando: 'n8n',
    args: ['start'],
    env: {
      N8N_PORT: '5680',
      N8N_USER_FOLDER: '.n8n-local',
      N8N_RUNNERS_BROKER_PORT: '5681',
    },
    url: 'http://localhost:5680',
  },
  personal: {
    nombre: 'n8n (instancia personal)',
    detalle: 'n8n start  ·  se puede detener, no iniciar desde aquí',
    puerto: 5678,
    url: 'http://localhost:5678',
    soloDetener: true,
  },
};

const procesos = new Map();

/* ---------------------------------------------------------------------------
 * Utilidades de red y procesos (Windows)
 * ------------------------------------------------------------------------ */

/** PIDs que tienen el puerto en estado LISTENING. */
function pidsEnPuerto(puerto) {
  try {
    const salida = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
    const pids = new Set();
    for (const linea of salida.split(/\r?\n/)) {
      const coincidencia = linea.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
      if (coincidencia && Number(coincidencia[1]) === Number(puerto)) {
        pids.add(Number(coincidencia[2]));
      }
    }
    return [...pids].filter((pid) => pid > 4);
  } catch {
    return [];
  }
}

/** Nombre del proceso (node.exe, n8n.exe...). */
function nombreProceso(pid) {
  try {
    const salida = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' });
    const coincidencia = salida.match(/^\s*(\S+)\s+\d+/m);
    return coincidencia ? coincidencia[1] : 'desconocido';
  } catch {
    return 'desconocido';
  }
}

/** Puertos en los que también escucha un mismo PID (n8n 2.x abre el puerto+1
 *  para su task broker: si matas ese PID cae la instancia completa). */
function puertosDelProceso(pid) {
  try {
    const salida = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
    const puertos = new Set();
    for (const linea of salida.split(/\r?\n/)) {
      const coincidencia = linea.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
      if (coincidencia && Number(coincidencia[2]) === pid) puertos.add(Number(coincidencia[1]));
    }
    return [...puertos].sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** Libera un puerto: mata el proceso que lo escucha (con su árbol). */
function liberarPuerto(puerto) {
  const pids = pidsEnPuerto(puerto);
  if (pids.length === 0) return { ok: true, mensaje: `El puerto ${puerto} ya estaba libre.` };

  const detalle = [];
  for (const pid of pids) {
    const proceso = nombreProceso(pid);
    const hermanos = puertosDelProceso(pid).filter((otro) => otro !== puerto);
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      detalle.push(
        `${proceso} (PID ${pid})` +
          (hermanos.length ? ` — también liberaba ${hermanos.join(', ')}` : ''),
      );
    } catch {
      detalle.push(`PID ${pid} (no se pudo terminar)`);
    }
  }
  return { ok: true, mensaje: `Puerto ${puerto} liberado: ${detalle.join(', ')}.` };
}

/* ---------------------------------------------------------------------------
 * Ciclo de vida de los servicios
 * ------------------------------------------------------------------------ */
function iniciarServicio(clave) {
  const servicio = SERVICIOS[clave];
  if (!servicio) return { ok: false, mensaje: `Servicio desconocido: ${clave}` };
  if (servicio.soloDetener) {
    return { ok: false, mensaje: 'Esta instancia se administra fuera del panel: usa "Liberar puerto".' };
  }
  if (procesos.get(clave)?.activo) {
    return { ok: false, mensaje: `${servicio.nombre} ya está en ejecución.` };
  }
  if (pidsEnPuerto(servicio.puerto).length > 0) {
    return {
      ok: false,
      mensaje: `El puerto ${servicio.puerto} ya está ocupado. Libéralo antes de iniciar.`,
    };
  }

  const registro = procesos.get(clave) ?? { log: [], activo: false };
  registro.log = [];
  registro.activo = true;
  procesos.set(clave, registro);

  const agregar = (texto) => {
    for (const linea of String(texto).split(/\r?\n/).filter((l) => l.trim() !== '')) {
      registro.log.push(linea);
      if (registro.log.length > 80) registro.log.shift();
    }
  };

  agregar(`$ ${servicio.comando} ${servicio.args.join(' ')}`);

  let hijo;
  try {
    hijo = spawn(servicio.comando, servicio.args, {
      cwd: RAIZ,
      shell: true,
      env: { ...process.env, ...(servicio.env ?? {}), FORCE_COLOR: '0' },
    });
  } catch (error) {
    registro.activo = false;
    agregar(`No se pudo iniciar: ${error.message}`);
    return { ok: false, mensaje: `No se pudo iniciar ${servicio.nombre}: ${error.message}` };
  }

  registro.hijo = hijo;

  hijo.stdout?.on('data', (trozo) => agregar(trozo.toString()));
  hijo.stderr?.on('data', (trozo) => agregar(trozo.toString()));
  hijo.on('error', (error) => {
    registro.activo = false;
    agregar(`Error: ${error.message}`);
  });
  hijo.on('exit', (codigo) => {
    registro.activo = false;
    agregar(`— proceso terminado (código ${codigo}) —`);
  });

  return { ok: true, mensaje: `${servicio.nombre} iniciando en el puerto ${servicio.puerto}…` };
}

function detenerServicio(clave) {
  const servicio = SERVICIOS[clave];
  if (!servicio) return { ok: false, mensaje: `Servicio desconocido: ${clave}` };

  const resultado = liberarPuerto(servicio.puerto);
  const registro = procesos.get(clave);
  if (registro) registro.activo = false;
  return {
    ok: true,
    mensaje: `${servicio.nombre}: ${resultado.mensaje}`,
  };
}

function estadoPuertos() {
  return Object.entries(SERVICIOS).map(([clave, servicio]) => {
    const pids = pidsEnPuerto(servicio.puerto);
    return {
      clave,
      nombre: servicio.nombre,
      detalle: servicio.detalle,
      puerto: servicio.puerto,
      url: servicio.url,
      activo: pids.length > 0,
      pids,
      procesos: pids.map((pid) => ({ pid, nombre: nombreProceso(pid) })),
      soloDetener: Boolean(servicio.soloDetener),
      gestionado: Boolean(procesos.get(clave)?.activo),
      log: procesos.get(clave)?.log ?? [],
    };
  });
}

/* ---------------------------------------------------------------------------
 * Servidor HTTP de control
 * ------------------------------------------------------------------------ */
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function responderJson(respuesta, datos, codigo = 200) {
  respuesta.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
  });
  respuesta.end(JSON.stringify(datos));
}

function leerCuerpo(peticion) {
  return new Promise((resolver) => {
    let cuerpo = '';
    peticion.on('data', (trozo) => (cuerpo += trozo));
    peticion.on('end', () => {
      try {
        resolver(JSON.parse(cuerpo || '{}'));
      } catch {
        resolver({});
      }
    });
  });
}

const servidor = createServer(async (peticion, respuesta) => {
  const url = new URL(peticion.url, `http://localhost:${PUERTO_CONTROL}`);

  if (peticion.method === 'OPTIONS') {
    respuesta.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    respuesta.end();
    return;
  }

  // API ------------------------------------------------------------------
  if (url.pathname === '/api/estado') {
    responderJson(respuesta, { ok: true, servicios: estadoPuertos() });
    return;
  }

  if (url.pathname === '/api/servicio' && peticion.method === 'POST') {
    const cuerpo = await leerCuerpo(peticion);
    const accion = cuerpo.accion === 'detener' ? 'detener' : 'iniciar';
    const resultado =
      accion === 'iniciar' ? iniciarServicio(cuerpo.servicio) : detenerServicio(cuerpo.servicio);
    responderJson(respuesta, { ...resultado, servicios: estadoPuertos() });
    return;
  }

  if (url.pathname === '/api/liberar' && peticion.method === 'POST') {
    const cuerpo = await leerCuerpo(peticion);
    const puertos = Array.isArray(cuerpo.puertos) && cuerpo.puertos.length > 0
      ? cuerpo.puertos
      : [Number(cuerpo.puerto)].filter(Boolean);
    const mensajes = puertos.map((puerto) => liberarPuerto(puerto).mensaje);
    responderJson(respuesta, { ok: true, mensaje: mensajes.join(' | '), servicios: estadoPuertos() });
    return;
  }

  // Panel ----------------------------------------------------------------
  if (url.pathname === '/' || url.pathname === '/control.html') {
    const archivo = join(RAIZ, 'control.html');
    if (!existsSync(archivo)) {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      respuesta.end('No se encontró control.html');
      return;
    }
    respuesta.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    createReadStream(archivo).pipe(respuesta);
    return;
  }

  // Reporte (siempre disponible, incluso sin el servidor 8080) ----------
  if (url.pathname === '/reporte' || url.pathname === '/assets/reporte-lote.html') {
    const archivo = join(RAIZ, 'assets', 'reporte-lote.html');
    if (!existsSync(archivo)) {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      respuesta.end('Genera el reporte con: node tools/build.mjs');
      return;
    }
    respuesta.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    createReadStream(archivo).pipe(respuesta);
    return;
  }

  // Archivos estáticos del proyecto --------------------------------------
  const destino = join(RAIZ, normalize(url.pathname).replace(/^([/\\])+/, ''));
  if (destino.startsWith(RAIZ) && existsSync(destino) && statSync(destino).isFile()) {
    respuesta.writeHead(200, {
      'Content-Type': TIPOS[extname(destino).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(destino).pipe(respuesta);
    return;
  }

  respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  respuesta.end('404');
});

servidor.listen(PUERTO_CONTROL, () => {
  console.log(`\n  FacturaBot · panel de control`);
  console.log(`  http://localhost:${PUERTO_CONTROL}/control.html`);
  console.log(`  API: http://localhost:${PUERTO_CONTROL}/api/estado\n`);
});
