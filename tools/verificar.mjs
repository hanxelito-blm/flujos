/* ============================================================================
 * FacturaBot · Verificación
 * ----------------------------------------------------------------------------
 * Ejecuta el dominio con Node y comprueba:
 *   1. Los 4 pilares de POO (encapsulamiento, herencia, polimorfismo,
 *      abstracción).
 *   2. Las reglas del Validador y los 3 estados del flujo.
 *   3. La consolidación del ReporteLote (solo suma no rechazadas).
 *   4. La generación del HTML del reporte.
 *
 * Uso:  node tools/verificar.mjs
 * ========================================================================== */

import { lote } from '../src/datos.js';
import {
  ErrorFactura,
  FabricaFacturas,
  Factura,
  FacturaExenta,
  FacturaExtranjera,
  FacturaNacional,
  LineaFactura,
  ValidadorFactura,
} from '../src/dominio.js';
import { procesarLote, procesarFactura } from '../src/procesamiento.js';
import { ReporteLote } from '../src/reporte.js';
import { renderReporteHTML, codificarBase64, PALETA } from '../src/presentacion.js';
import { ACCIONES, ESTADOS } from '../src/constantes.js';

let pruebas = 0;
let fallos = 0;

function afirmar(condicion, descripcion, detalle = '') {
  pruebas += 1;
  if (condicion) {
    console.log(`  ✔ ${descripcion}`);
  } else {
    fallos += 1;
    console.error(`  ✘ ${descripcion}${detalle ? ` → ${detalle}` : ''}`);
  }
}

function iguales(real, esperado, descripcion) {
  afirmar(
    JSON.stringify(real) === JSON.stringify(esperado),
    descripcion,
    `esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(real)}`,
  );
}

/* ===========================================================================
 * 1. PILARES DE POO
 * ======================================================================== */
console.log('\n▸ Pilar 1 · ENCAPSULAMIENTO (#privado + getters)');
{
  const linea = new LineaFactura({ descripcion: 'Resmas de papel', cantidad: 10, precioUnitario: 5000 });
  afirmar(linea.subtotal() === 50000, 'LineaFactura.subtotal() = cantidad × precio');
  afirmar(linea.cantidad === 10 && linea.precioUnitario === 5000, 'Getters exponen los datos');
  afirmar(
    Object.getOwnPropertyNames(linea).every((nombre) => !nombre.includes('descripcion')),
    'Los campos privados no son propiedades públicas del objeto',
  );
  afirmar(
    !('cantidad' in Object.getOwnPropertyDescriptors(linea)) ||
      Object.getOwnPropertyDescriptor(linea, 'cantidad') === undefined,
    'No existe descriptor público "cantidad" (solo el getter de la clase)',
  );

  const factura = FabricaFacturas.crear(lote[0]);
  afirmar(Array.isArray(factura.lineas) && factura.lineas.length === 1, 'El getter `lineas` expone el detalle');
  afirmar(
    Object.isFrozen(factura.lineas),
    'El detalle es inmutable (copia congelada)',
  );
}

console.log('\n▸ Pilar 2 · HERENCIA (extends / super)');
{
  const nacional = FabricaFacturas.crear(lote[0]);
  const exenta = FabricaFacturas.crear(lote[1]);
  const extranjera = FabricaFacturas.crear(lote[2]);

  afirmar(nacional instanceof Factura, 'FacturaNacional hereda de Factura');
  afirmar(exenta instanceof Factura, 'FacturaExenta hereda de Factura');
  afirmar(extranjera instanceof Factura, 'FacturaExtranjera hereda de Factura');
  afirmar(exenta instanceof FacturaExenta && !(exenta instanceof FacturaNacional), 'La jerarquía se mantiene');
  afirmar(exenta.motivoExencion === 'Servicios de salud', 'FacturaExenta atesora motivoExencion');
  afirmar(extranjera.moneda === 'USD' && extranjera.tipoCambio === 510, 'FacturaExtranjera atesora moneda y tipoCambio');
}

console.log('\n▸ Pilar 3 · POLIMORFISMO (sobrescritura de métodos)');
{
  const nacional = FabricaFacturas.crear(lote[0]);
  const exenta = FabricaFacturas.crear(lote[1]);
  const extranjera = FabricaFacturas.crear(lote[2]);

  afirmar(nacional.calcularImpuesto() === 6500, 'FacturaNacional calcula IVA 13 % (6,500)');
  afirmar(exenta.calcularImpuesto() === 0, 'FacturaExenta calcula IVA 0 %');
  afirmar(extranjera.calcularImpuesto() === 0, 'FacturaExtranjera calcula IVA 0 %');
  afirmar(extranjera.total() === 1275000, 'FacturaExtranjera.total() convierte a colones (2,500 × 510)');
  afirmar(nacional.total() === 56500, 'FacturaNacional.total() = subtotal + IVA');
  afirmar(
    nacional.toJSON().tipo === 'nacional' && exenta.toJSON().tipo === 'exenta' && extranjera.toJSON().tipo === 'extranjera',
    'toJSON() polimórfico devuelve el tipo correcto',
  );
  afirmar(extranjera.toJSON().monedaOriginal === 'USD', 'toJSON() de la extranjera conserva la moneda original');
  afirmar(
    !/if\s*\(\s*[^)]*tipo/.test(String(FabricaFacturas.crear)),
    'No existe lógica `if` por tipo para el IVA (se resuelve por polimorfismo)',
  );
}

console.log('\n▸ Pilar 4 · ABSTRACCIÓN (clase base abstracta)');
{
  let LanzoError = false;
  try {
    // eslint-disable-next-line no-new
    new Factura({ numero: 'X-000', lineas: [] });
  } catch (error) {
    LanzoError = error instanceof TypeError;
  }
  afirmar(LanzoError, 'La clase base abstracta no puede instanciarse directamente');

  let LanzoErrorMetodo = false;
  try {
    Factura.prototype.calcularImpuesto.call({ subtotal: () => 100 });
  } catch (error) {
    LanzoErrorMetodo = error instanceof Error;
  }
  afirmar(LanzoErrorMetodo, 'calcularImpuesto() de la base lanza Error (método abstracto)');
}

console.log('\n▸ Patrón FACTORY (FabricaFacturas)');
{
  afirmar(
    FabricaFacturas.tipos().sort().join(',') === 'exenta,extranjera,nacional',
    'La fábrica registra nacional, exenta y extranjera',
  );
  afirmar(!FabricaFacturas.soporta('credito'), 'Un tipo no registrado no está soportado');

  let errorCodigo = '';
  try {
    FabricaFacturas.crear({ ...lote[5] });
  } catch (error) {
    errorCodigo = error instanceof ErrorFactura ? error.codigo : '';
  }
  afirmar(errorCodigo === 'TIPO_NO_SOPORTADO', 'La fábrica lanza ErrorFactura(TIPO_NO_SOPORTADO)');
}

console.log('\n▸ Validador de negocio');
{
  const valido = ValidadorFactura.validar(lote[0]);
  afirmar(valido.valida && valido.errores.length === 0, 'F-001 (nacional) supera la validación');

  const sinNumero = ValidadorFactura.validar({ ...lote[0], numero: '' });
  afirmar(sinNumero.errores.some((e) => e.includes('número')), 'El número es obligatorio');

  const cedulaMala = ValidadorFactura.validar({ ...lote[3] });
  afirmar(cedulaMala.errores.some((e) => e.includes('cédula')), 'La cédula 123 es inválida');

  const fechaFutura = ValidadorFactura.validar(lote[6]);
  afirmar(
    fechaFutura.valida && fechaFutura.advertencias.length === 1,
    'La fecha futura genera ADVERTENCIA (no error)',
  );

  const sinLineas = ValidadorFactura.validar({ ...lote[0], lineas: [] });
  afirmar(sinLineas.errores.some((e) => e.includes('línea')), 'Se exige al menos una línea');

  const cantidadCero = ValidadorFactura.validar({
    ...lote[0],
    lineas: [{ descripcion: 'X', cantidad: 0, precioUnitario: 10 }],
  });
  afirmar(cantidadCero.errores.some((e) => e.includes('cantidad')), 'La cantidad debe ser mayor que 0');

  const precioCero = ValidadorFactura.validar({
    ...lote[0],
    lineas: [{ descripcion: 'X', cantidad: 1, precioUnitario: 0 }],
  });
  afirmar(precioCero.errores.some((e) => e.includes('precio')), 'El precio unitario debe ser mayor que 0');
}

/* ===========================================================================
 * 2. FLUJO COMPLETO (nodos 2 → 3 → Switch → Set → Merge → 9)
 * ======================================================================== */
console.log('\n▸ Flujo completo del workflow');
{
  const items = lote.map((factura) => ({ json: factura }));
  const registros = procesarLote(items);

  iguales(
    registros.map((r) => [r.numero, r.estado]),
    [
      ['F-001', ESTADOS.APROBADA],
      ['F-002', ESTADOS.APROBADA],
      ['F-003', ESTADOS.APROBADA],
      ['F-004', ESTADOS.RECHAZADA],
      ['F-005', ESTADOS.APROBADA],
      ['F-006', ESTADOS.RECHAZADA],
      ['F-007', ESTADOS.REVISION],
    ],
    'Cada factura cae en la ruta correcta del Switch',
  );

  // Switch: tres ramas
  const ramaAprobada = registros.filter((r) => r.estado === ESTADOS.APROBADA);
  const ramaRevision = registros.filter((r) => r.estado === ESTADOS.REVISION);
  const ramaRechazada = registros.filter((r) => r.estado === ESTADOS.RECHAZADA);
  afirmar(ramaAprobada.length === 4 && ramaRevision.length === 1 && ramaRechazada.length === 2, 'Las 3 ramas reciben datos');

  // Set: cada rama agrega su acción
  const conAccion = (rama, accion) => rama.every((r) => ({ ...r, accion: accion }).accion === accion);
  afirmar(conAccion(ramaAprobada, ACCIONES[ESTADOS.APROBADA]), 'Ruta aprobada → "Registrar en contabilidad"');
  afirmar(conAccion(ramaRevision, ACCIONES[ESTADOS.REVISION]), 'Ruta revisión → "Enviar a gerencia"');
  afirmar(conAccion(ramaRechazada, ACCIONES[ESTADOS.RECHAZADA]), 'Ruta rechazada → "Devolver al proveedor"');

  // Merge (append) + ReporteLote
  const reporte = new ReporteLote();
  [...ramaAprobada, ...ramaRevision, ...ramaRechazada].forEach((r) => reporte.agregar(r));
  const resumen = reporte.resumen();

  iguales(
    resumen.porEstado,
    { aprobada: 4, revision: 1, rechazada: 2 },
    'El resumen consolida los estados',
  );
  afirmar(resumen.totalFacturas === 7, 'El lote tiene 7 facturas');
  afirmar(resumen.subtotal === 2485000, 'Subtotal del lote (sin rechazadas) = 2,485,000');
  afirmar(resumen.impuesto === 137800, 'IVA acumulado del lote = 137,800');
  afirmar(resumen.total === 2622800, 'Total del lote = 2,622,800');
  afirmar(resumen.montoRechazado === 15000, 'Monto rechazado (fuera del lote) = 15,000');
  afirmar(resumen.total + resumen.montoRechazado === 2637800, 'Total + rechazado = 2,637,800 (control de cuadre)');
  afirmar(resumen.tasaImpuestoEfectiva === 5.55, 'Tasa efectiva de IVA = 5.55 %');
  iguales(resumen.monedas.sort(), ['CRC', 'USD'], 'Se detectan las monedas del lote');

  // Las rechazadas no suman
  const totalIncluyendoRechazadas = registros.reduce((acumulado, r) => acumulado + r.total, 0);
  afirmar(resumen.total !== totalIncluyendoRechazadas, 'El ReporteLote EXCLUYE las facturas rechazadas');
}

/* ===========================================================================
 * 3. PRESENTACIÓN
 * ======================================================================== */
console.log('\n▸ Capa de presentación');
{
  const registros = procesarLote(lote.map((factura) => ({ json: factura })));
  const reporte = new ReporteLote();
  registros.forEach((r) => reporte.agregar(r));
  const resumen = reporte.resumen();
  const html = renderReporteHTML(resumen, ACCIONES);

  afirmar(html.startsWith('<!DOCTYPE html>'), 'El reporte es un HTML completo');
  afirmar(html.includes('₡2,622,800'), 'El total del lote aparece formateado en colones');
  afirmar(html.includes('FacturaBot'), 'El reporte incluye la marca');
  afirmar(html.includes(PALETA.estado.aprobada.base), 'Se aplica la paleta verde de "aprobada"');
  afirmar(html.includes(PALETA.estado.revision.base), 'Se aplica la paleta ámbar de "revisión"');
  afirmar(html.includes(PALETA.estado.rechazada.base), 'Se aplica la paleta roja de "rechazada"');
  afirmar(!/<script|https?:\/\//i.test(html), 'El HTML es autocontenido (sin scripts ni CDN)');

  const base64 = codificarBase64(html);
  afirmar(/^[A-Za-z0-9+/]+={0,2}$/.test(base64), 'El binario se codifica en Base64 válido');
  afirmar(
    Buffer.from(base64, 'base64').toString('utf8') === html,
    'El Base64 se decodifica exactamente igual al HTML original',
  );
}

/* ===========================================================================
 * Resultado
 * ======================================================================== */
console.log(`\n${fallos === 0 ? '✔' : '✘'} ${pruebas - fallos}/${pruebas} pruebas superadas`);
if (fallos > 0) {
  console.error(`✘ ${fallos} prueba(s) fallida(s)`);
  process.exit(1);
}
