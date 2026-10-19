/* ============================================================================
 * FacturaBot · Prueba de los nodos tal como los ejecuta n8n
 * ----------------------------------------------------------------------------
 * El nodo Code de n8n envuelve el código en una función y expone `$input`.
 * Este script replica ese comportamiento (new Function) para ejecutar EXACTAMENTE
 * el mismo JavaScript que se pegará en los nodos 2, 3 y 9, y verificar que:
 *   - la sintaxis es válida,
 *   - la estructura de salida es [{ json: {...} }],
 *   - el Switch recibe el campo `estado` con los tres valores esperados,
 *   - el nodo 9 devuelve UN único ítem con el resumen y el binario HTML.
 *
 * Uso:  node tools/probar-nodos.mjs
 * ========================================================================== */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leerNodo = (nombre) => readFileSync(join(RAIZ, 'nodes', nombre), 'utf8');

let pruebas = 0;
let fallos = 0;
const afirmar = (condicion, descripcion, detalle = '') => {
  pruebas += 1;
  if (condicion) console.log(`  ✔ ${descripcion}`);
  else {
    fallos += 1;
    console.error(`  ✘ ${descripcion}${detalle ? ` → ${detalle}` : ''}`);
  }
};

/** Ejecuta el código de un nodo como lo hace n8n: cuerpo de función + $input. */
function ejecutarNodo(codigo, items) {
  const cuerpo = `return (function () {\n${codigo}\n})();`;
  const fn = new Function('$input', cuerpo);
  return fn({
    all: () => items,
    first: () => items[0],
  });
}

console.log('\n▸ Nodo 2 · "Datos de prueba"');
{
  const codigo = leerNodo('02-datos-prueba.js');
  const salida = ejecutarNodo(codigo, []);
  afirmar(Array.isArray(salida) && salida.length === 7, 'Devuelve 7 items');
  afirmar(salida.every((item) => item && typeof item === 'object' && 'json' in item), 'Estructura n8n [{ json: {...} }]');
  afirmar(salida[0].json.numero === 'F-001' && salida[6].json.numero === 'F-007', 'Conserva el orden del lote');
  afirmar(salida[2].json.tipoCambio === 510 && salida[1].json.motivoExencion === 'Servicios de salud', 'Conserva los campos por tipo');
}

console.log('\n▸ Nodo 3 · "Procesar facturas"');
const itemsNodo2 = ejecutarNodo(leerNodo('02-datos-prueba.js'), []);
let salidaNodo3 = [];
{
  const codigo = leerNodo('03-procesar-facturas.js');
  salidaNodo3 = ejecutarNodo(codigo, itemsNodo2);

  afirmar(salidaNodo3.length === 7, 'Devuelve 7 registros');
  afirmar(salidaNodo3.every((item) => 'json' in item && 'estado' in item.json), 'Cada item trae `estado`');
  afirmar(
    JSON.stringify(salidaNodo3.map((i) => i.json.estado)) ===
      JSON.stringify(['aprobada', 'aprobada', 'aprobada', 'rechazada', 'aprobada', 'rechazada', 'revision']),
    'Los estados coinciden con las 3 rutas del Switch',
  );
  afirmar(
    salidaNodo3[0].json.total === 56500 && salidaNodo3[2].json.total === 1275000,
    'Totales por polimorfismo (nacional 56,500 · extranjera 1,275,000)',
  );
  afirmar(salidaNodo3[3].json.motivo.includes('cédula'), 'F-004 explica el rechazo por cédula');
  afirmar(salidaNodo3[5].json.motivo.includes('no está soportado'), 'F-006 explica el rechazo por tipo');
  afirmar(salidaNodo3[6].json.motivo.includes('futura'), 'F-007 explica la revisión por fecha futura');
}

console.log('\n▸ Nodo 4-8 · Switch + Set + Merge (simulados)');
let itemsMerge = [];
{
  const rutas = { aprobada: [], revision: [], rechazada: [] };
  for (const item of salidaNodo3) rutas[item.json.estado].push(item);

  const acciones = {
    aprobada: 'Registrar en contabilidad',
    revision: 'Enviar a gerencia',
    rechazada: 'Devolver al proveedor',
  };
  // Nodos Set: agregan `accion` conservando el resto de campos.
  for (const [estado, items] of Object.entries(rutas)) {
    for (const item of items) item.json.accion = acciones[estado];
  }
  // Nodo Merge en modo append: concatena las tres ramas.
  itemsMerge = [...rutas.aprobada, ...rutas.revision, ...rutas.rechazada];

  afirmar(rutas.aprobada.length === 4 && rutas.revision.length === 1 && rutas.rechazada.length === 2, 'Las 3 ramas tienen datos');
  afirmar(
    itemsMerge.every((item) => typeof item.json.accion === 'string'),
    'Cada item sale del Merge con su campo `accion`',
  );
  afirmar(
    itemsMerge.find((i) => i.json.numero === 'F-007').json.accion === 'Enviar a gerencia',
    'F-007 (revisión) sale con "Enviar a gerencia"',
  );
}

console.log('\n▸ Nodo 9 · "Reporte del lote"');
{
  const codigo = leerNodo('09-reporte-lote.js');
  const salida = ejecutarNodo(codigo, itemsMerge);

  afirmar(salida.length === 1, 'Devuelve UN único ítem');
  const json = salida[0].json;
  afirmar(json.totalFacturas === 7, 'El resumen contiene las 7 facturas');
  afirmar(json.porEstado.aprobada === 4 && json.porEstado.revision === 1 && json.porEstado.rechazada === 2, 'Consolida los tres estados');
  afirmar(json.subtotal === 2485000 && json.impuesto === 137800 && json.total === 2622800, 'Consolida los montos (sin rechazadas)');
  afirmar(json.montoRechazado === 15000, 'Reporta el monto rechazado por separado');
  afirmar(typeof json.html === 'string' && json.html.startsWith('<!DOCTYPE html>'), 'Incluye el reporte HTML');
  afirmar(json.html.includes('₡2,622,800'), 'El HTML muestra el total del lote en colones');

  const binario = salida[0].binary?.['reporte-lote.html'];
  afirmar(Boolean(binario), 'Devuelve el binario "reporte-lote.html"');
  afirmar(binario?.mimeType === 'text/html', 'El binario declara mimeType text/html');
  afirmar(
    Buffer.from(binario.data, 'base64').toString('utf8') === json.html,
    'El binario decodifica exactamente al HTML del resumen',
  );
}

console.log('\n▸ workflow.json (estructura del workflow)');
{
  const workflow = JSON.parse(readFileSync(join(RAIZ, 'workflow.json'), 'utf8'));
  const nombres = workflow.nodes.map((n) => n.name);

  afirmar(workflow.nodes.length === 9, `El workflow tiene 9 nodos (tiene ${workflow.nodes.length})`);
  afirmar(
    nombres.join(' | ') ===
      'Manual Trigger | Datos de prueba | Procesar facturas | Clasificar | Aprobada | Revisión | Rechazada | Unificar lote | Reporte del lote',
    'Los 9 nodos están en el orden de la arquitectura',
  );
  afirmar(workflow.nodes.filter((n) => n.type === 'n8n-nodes-base.code').length === 3, 'Hay 3 nodos Code');
  afirmar(
    workflow.nodes.every((n) => n.parameters?.mode === 'runOnceForAllItems' || n.type !== 'n8n-nodes-base.code'),
    'Los nodos Code corren "Run Once for All Items"',
  );

  const switchNode = workflow.nodes.find((n) => n.name === 'Clasificar');
  afirmar(switchNode.type === 'n8n-nodes-base.switch', 'El nodo 4 es un Switch');
  afirmar(
    switchNode.parameters.rules.values.map((v) => v.outputKey).join(',') === 'aprobada,revision,rechazada',
    'El Switch tiene las 3 rutas',
  );
  afirmar(
    switchNode.parameters.rules.values.every((v) => v.conditions.conditions[0].leftValue === '={{ $json.estado }}'),
    'Todas las rutas evalúan {{ $json.estado }}',
  );

  const sets = workflow.nodes.filter((n) => n.type === 'n8n-nodes-base.set');
  afirmar(sets.length === 3, 'Hay 3 nodos Set');
  afirmar(
    sets.every((s) => s.parameters.includeOtherFields === true),
    'Los Set conservan los campos originales (includeOtherFields)',
  );
  afirmar(
    sets
      .map((s) => s.parameters.assignments.assignments[0].value)
      .join(' | ') === 'Registrar en contabilidad | Enviar a gerencia | Devolver al proveedor',
    'Cada Set agrega su acción',
  );

  const merge = workflow.nodes.find((n) => n.type === 'n8n-nodes-base.merge');
  afirmar(merge.parameters.mode === 'append', 'El Merge está en modo Append');
  afirmar(merge.parameters.numberInputs === 3, 'El Merge tiene 3 entradas');

  afirmar(
    workflow.connections.Clasificar.main.length === 3 &&
      workflow.connections.Clasificar.main[0][0].node === 'Aprobada' &&
      workflow.connections.Clasificar.main[1][0].node === 'Revisión' &&
      workflow.connections.Clasificar.main[2][0].node === 'Rechazada',
    'Las 3 salidas del Switch están conectadas',
  );
  afirmar(
    workflow.connections['Aprobada'].main[0][0].index === 0 &&
      workflow.connections['Revisión'].main[0][0].index === 1 &&
      workflow.connections['Rechazada'].main[0][0].index === 2,
    'Las 3 ramas entran al Merge por entradas distintas',
  );
  afirmar(
    workflow.connections['Unificar lote'].main[0][0].node === 'Reporte del lote',
    'El Merge alimenta al nodo 9',
  );
}

console.log(`\n${fallos === 0 ? '✔' : '✘'} ${pruebas - fallos}/${pruebas} pruebas superadas`);
if (fallos > 0) process.exit(1);
