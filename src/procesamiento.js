/* ============================================================================
 * FacturaBot · Capa de procesamiento (nodo 3 · "Procesar facturas")
 * ----------------------------------------------------------------------------
 * Traduce cada item de n8n a una factura (vía Factory), lo valida y devuelve
 * un registro normalizado con `estado`, que es el campo que consume el
 * nodo Switch ("Clasificar").
 * ========================================================================== */

import { ErrorFactura, FabricaFacturas, LineaFactura, ValidadorFactura } from './dominio.js';
import { ESTADOS } from './constantes.js';

/**
 * Procesa una factura cruda y devuelve el registro normalizado.
 * @param {object} datos factura tal como viene del nodo de datos de prueba
 */
export function procesarFactura(datos = {}) {
  const validacion = ValidadorFactura.validar(datos);
  const errores = [...validacion.errores];
  const advertencias = [...validacion.advertencias];

  // La Factory decide la subclase; si el tipo no existe, lanza ErrorFactura.
  let instancia = null;
  try {
    instancia = FabricaFacturas.crear(datos);
  } catch (error) {
    // El tipo no soportado ya fue reportado por el validador: no se duplica.
    const yaReportado =
      error instanceof ErrorFactura && error.codigo === 'TIPO_NO_SOPORTADO';
    if (!yaReportado && validacion.errores.length === 0) {
      errores.push(error.message);
    }
  }

  const identidad = {
    numero: datos.numero ?? null,
    tipo: String(datos.tipo ?? '').trim().toLowerCase(),
    proveedor: datos.proveedor ?? null,
    cedulaJuridica: datos.cedulaJuridica ?? null,
    fecha: datos.fecha ?? null,
  };

  const lineas = Array.isArray(datos.lineas)
    ? datos.lineas.map((linea) => ({
        descripcion: String(linea?.descripcion ?? ''),
        cantidad: Number(linea?.cantidad),
        precioUnitario: Number(linea?.precioUnitario),
      }))
    : [];

  /* --- Factura rechazada: se reporta un monto REFERENCIAL (sin IVA) ------ *
   * y se marca para que el ReporteLote lo excluya de las sumas del lote.   */
  if (errores.length > 0) {
    const montoReferencial = LineaFactura.subtotalDe(datos.lineas);
    return {
      ...identidad,
      estado: ESTADOS.RECHAZADA,
      nivel: 'error',
      motivo: errores.join(' | '),
      errores,
      advertencias,
      lineas,
      subtotal: montoReferencial,
      impuesto: 0,
      total: montoReferencial,
      moneda: 'CRC',
      referencia: true,
    };
  }

  /* --- Factura válida: los montos salen de la instancia (polimorfismo) --- */
  const calculo = instancia.toJSON();

  return {
    ...identidad,
    ...calculo,
    estado: advertencias.length > 0 ? ESTADOS.REVISION : ESTADOS.APROBADA,
    nivel: advertencias.length > 0 ? 'aviso' : 'ok',
    motivo: advertencias.join(' | '),
    errores,
    advertencias,
    referencia: false,
  };
}

/**
 * Procesa el lote completo (el nodo Code corre "Run Once for All Items").
 * @param {Array<{json: object}>} items items de entrada de n8n
 */
export function procesarLote(items = []) {
  return items.map((item) => procesarFactura(item?.json ?? item));
}
