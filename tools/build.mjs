/* ============================================================================
 * FacturaBot · Build
 * ----------------------------------------------------------------------------
 * Genera, a partir de la fuente única `src/`:
 *   - nodes/02-datos-prueba.js      (código pegable en el nodo 2)
 *   - nodes/03-procesar-facturas.js (código pegable en el nodo 3)
 *   - nodes/09-reporte-lote.js      (código pegable en el nodo 9)
 *   - workflow.json                 (workflow importable en n8n · 9 nodos)
 *   - assets/reporte-lote.html      (muestra renderizada del reporte)
 *
 * Uso:  node tools/build.mjs
 * ========================================================================== */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lote } from '../src/datos.js';
import { procesarLote } from '../src/procesamiento.js';
import { ReporteLote } from '../src/reporte.js';
import { renderReporteHTML, codificarBase64 } from '../src/presentacion.js';
import { ACCIONES } from '../src/constantes.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RAIZ, 'src');

const leer = (archivo) => readFileSync(join(SRC, archivo), 'utf8');

/**
 * Convierte un módulo ESM en un fragmento plano pegable en el nodo Code:
 * elimina los `import` y la palabra clave `export`.
 */
function aPlano(codigo) {
  return codigo
    .split('\n')
    .filter((linea) => !/^\s*import\s[^\n]*from\s+['"][^'"]+['"];?\s*$/.test(linea))
    .map((linea) => linea.replace(/^(\s*)export\s+(default\s+)?/, '$1'))
    .join('\n');
}

const banner = (titulo, subtitulo) =>
  `/* ============================================================================
 * FacturaBot · ${titulo}
 * ----------------------------------------------------------------------------
 * ${subtitulo}
 * ========================================================================== */`;

/* ---------------------------------------------------------------------------
 * 1. Código de cada nodo Code
 * ------------------------------------------------------------------------ */
const codigoNodo2 = `${banner(
  'Nodo 2 · "Datos de prueba"',
  'Genera el lote de 7 facturas en la estructura nativa de n8n: [{ json: {...} }].',
)}

${aPlano(leer('datos.js'))}

return lote.map(f => ({ json: f }));
`;

const codigoNodo3 = `${banner(
  'Nodo 3 · "Procesar facturas"',
  'Jerarquía de clases (4 pilares de POO) + patrón Factory + Validador de negocio.',
)}

${aPlano(leer('dominio.js'))}

${aPlano(leer('constantes.js'))}

${aPlano(leer('procesamiento.js'))}

/* ==========================================================================
 * Ejecución del nodo (Run Once for All Items)
 * ======================================================================== */
const items = $input.all();
const registros = procesarLote(items);

return registros.map((json) => ({ json }));
`;

const codigoNodo9 = `${banner(
  'Nodo 9 · "Reporte del lote"',
  'Instancia ReporteLote, consolida las métricas y devuelve un único ítem con el',
  'resumen final + el reporte visual en HTML (descargable como binario).',
)}

${aPlano(leer('constantes.js'))}

${aPlano(leer('presentacion.js'))}

${aPlano(leer('reporte.js'))}

/* ==========================================================================
 * Ejecución del nodo (Run Once for All Items)
 * ======================================================================== */
const items = $input.all();

const reporte = new ReporteLote();
for (const item of items) {
  reporte.agregar(item.json);
}

const resumen = reporte.resumen();
const html = renderReporteHTML(resumen, ACCIONES);

return [
  {
    json: {
      ...resumen,
      html,
      archivo: 'reporte-lote.html',
    },
    binary: {
      'reporte-lote.html': {
        data: codificarBase64(html),
        mimeType: 'text/html',
        fileName: 'reporte-lote.html',
      },
    },
  },
];
`;

/* ---------------------------------------------------------------------------
 * 2. Definición de los 9 nodos del workflow
 * ------------------------------------------------------------------------ */
const id = (sufijo) => `fb000000-0000-4000-8000-0000000000${sufijo}`;

const nodos = [
  {
    parameters: {},
    id: id('01'),
    name: 'Manual Trigger',
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position: [-200, 300],
  },
  {
    parameters: { mode: 'runOnceForAllItems', jsCode: codigoNodo2 },
    id: id('02'),
    name: 'Datos de prueba',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [0, 300],
  },
  {
    parameters: { mode: 'runOnceForAllItems', jsCode: codigoNodo3 },
    id: id('03'),
    name: 'Procesar facturas',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [220, 300],
  },
  {
    parameters: {
      rules: {
        values: [
          {
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
              conditions: [
                {
                  id: id('4a'),
                  leftValue: '={{ $json.estado }}',
                  rightValue: 'aprobada',
                  operator: { type: 'string', operation: 'equals' },
                },
              ],
              combinator: 'and',
            },
            renameOutput: true,
            outputKey: 'aprobada',
          },
          {
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
              conditions: [
                {
                  id: id('4b'),
                  leftValue: '={{ $json.estado }}',
                  rightValue: 'revision',
                  operator: { type: 'string', operation: 'equals' },
                },
              ],
              combinator: 'and',
            },
            renameOutput: true,
            outputKey: 'revision',
          },
          {
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
              conditions: [
                {
                  id: id('4c'),
                  leftValue: '={{ $json.estado }}',
                  rightValue: 'rechazada',
                  operator: { type: 'string', operation: 'equals' },
                },
              ],
              combinator: 'and',
            },
            renameOutput: true,
            outputKey: 'rechazada',
          },
        ],
      },
      options: { fallbackOutput: 'none' },
    },
    id: id('04'),
    name: 'Clasificar',
    type: 'n8n-nodes-base.switch',
    typeVersion: 3.2,
    position: [440, 300],
  },
  {
    parameters: {
      includeOtherFields: true,
      options: {},
      assignments: {
        assignments: [
          { id: id('5a'), name: 'accion', value: 'Registrar en contabilidad', type: 'string' },
        ],
      },
    },
    id: id('05'),
    name: 'Aprobada',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [680, 100],
  },
  {
    parameters: {
      includeOtherFields: true,
      options: {},
      assignments: {
        assignments: [
          { id: id('6a'), name: 'accion', value: 'Enviar a gerencia', type: 'string' },
        ],
      },
    },
    id: id('06'),
    name: 'Revisión',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [680, 300],
  },
  {
    parameters: {
      includeOtherFields: true,
      options: {},
      assignments: {
        assignments: [
          { id: id('7a'), name: 'accion', value: 'Devolver al proveedor', type: 'string' },
        ],
      },
    },
    id: id('07'),
    name: 'Rechazada',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [680, 500],
  },
  {
    parameters: { mode: 'append', numberInputs: 3, options: {} },
    id: id('08'),
    name: 'Unificar lote',
    type: 'n8n-nodes-base.merge',
    typeVersion: 3.2,
    position: [920, 300],
  },
  {
    parameters: { mode: 'runOnceForAllItems', jsCode: codigoNodo9 },
    id: id('09'),
    name: 'Reporte del lote',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1160, 300],
  },
];

const conexiones = {
  'Manual Trigger': { main: [[{ node: 'Datos de prueba', type: 'main', index: 0 }]] },
  'Datos de prueba': { main: [[{ node: 'Procesar facturas', type: 'main', index: 0 }]] },
  'Procesar facturas': { main: [[{ node: 'Clasificar', type: 'main', index: 0 }]] },
  Clasificar: {
    main: [
      [{ node: 'Aprobada', type: 'main', index: 0 }],
      [{ node: 'Revisión', type: 'main', index: 0 }],
      [{ node: 'Rechazada', type: 'main', index: 0 }],
    ],
  },
  Aprobada: { main: [[{ node: 'Unificar lote', type: 'main', index: 0 }]] },
  Revisión: { main: [[{ node: 'Unificar lote', type: 'main', index: 1 }]] },
  Rechazada: { main: [[{ node: 'Unificar lote', type: 'main', index: 2 }]] },
  'Unificar lote': { main: [[{ node: 'Reporte del lote', type: 'main', index: 0 }]] },
};

const workflow = {
  name: 'FacturaBot · POO en n8n',
  nodes: nodos,
  connections: conexiones,
  active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: { templateCredsSetupCompleted: false },
  tags: [],
  versionId: 'fb000000-0000-4000-8000-0000000000ff',
};

/* ---------------------------------------------------------------------------
 * 3. Escritura de artefactos
 * ------------------------------------------------------------------------ */
mkdirSync(join(RAIZ, 'nodes'), { recursive: true });
mkdirSync(join(RAIZ, 'assets'), { recursive: true });

writeFileSync(join(RAIZ, 'nodes', '02-datos-prueba.js'), codigoNodo2, 'utf8');
writeFileSync(join(RAIZ, 'nodes', '03-procesar-facturas.js'), codigoNodo3, 'utf8');
writeFileSync(join(RAIZ, 'nodes', '09-reporte-lote.js'), codigoNodo9, 'utf8');
writeFileSync(join(RAIZ, 'workflow.json'), `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');

/* Muestra renderizada del reporte (mismo código que ejecutará n8n). */
const registros = procesarLote(lote.map((factura) => ({ json: factura })));
const reporte = new ReporteLote();
registros.forEach((registro) => reporte.agregar(registro));
const resumen = reporte.resumen();
const html = renderReporteHTML(resumen, ACCIONES);

writeFileSync(join(RAIZ, 'assets', 'reporte-lote.html'), html, 'utf8');

console.log('✔ workflow.json       · 9 nodos / 8 pasos');
console.log('✔ nodes/              · 3 archivos de código para copiar a n8n');
console.log('✔ assets/reporte-lote.html');
console.log(
  `  Lote: ${resumen.totalFacturas} facturas · aprobadas ${resumen.porEstado.aprobada} · revisión ${resumen.porEstado.revision} · rechazadas ${resumen.porEstado.rechazada}`,
);
console.log(
  `  Totales: subtotal ${resumen.subtotal} · IVA ${resumen.impuesto} · total ${resumen.total} (rechazado excluido: ${resumen.montoRechazado})`,
);
console.log(`  Base64 del reporte: ${codificarBase64(html).length} caracteres`);
