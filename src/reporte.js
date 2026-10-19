/* ============================================================================
 * FacturaBot · ReporteLote (nodo 9 · "Reporte del lote")
 * ----------------------------------------------------------------------------
 * ENCAPSULAMIENTO: la colección de facturas es privada (#facturas) y solo se
 * manipula a través de `agregar()`. `resumen()` consolida las métricas del
 * lote.
 *
 * REGLA DE NEGOCIO CLAVE: las sumas (subtotal, impuesto, total) SOLO incluyen
 * facturas NO rechazadas. El monto de las rechazadas se reporta aparte
 * (montoRechazado) para que gerencia vea el dinero en disputa sin que entre
 * en la contabilidad del lote.
 * ========================================================================== */

import { ESTADOS, MONEDA_LOCAL } from './constantes.js';

export class ReporteLote {
  #facturas = [];

  /**
   * Agrega un registro de factura ya procesado (el `json` que sale del nodo 3).
   * @param {object} f registro normalizado { estado, subtotal, impuesto, total, ... }
   */
  agregar(f) {
    if (!f || typeof f !== 'object') {
      throw new TypeError('ReporteLote.agregar() requiere un registro de factura.');
    }
    this.#facturas.push(f);
    return this;
  }

  /** Copia defensiva: nadie puede mutar la colección interna. */
  get facturas() {
    return [...this.#facturas];
  }

  get tamano() {
    return this.#facturas.length;
  }

  /** Facturas que sí computan en los totales del lote. */
  get activas() {
    return this.#facturas.filter((f) => f.estado !== ESTADOS.RECHAZADA);
  }

  /** Facturas rechazadas (se excluyen de las sumas). */
  get rechazadas() {
    return this.#facturas.filter((f) => f.estado === ESTADOS.RECHAZADA);
  }

  /**
   * Consolidación de métricas del lote.
   */
  resumen() {
    const total = this.#facturas.length;

    const porEstado = {
      [ESTADOS.APROBADA]: 0,
      [ESTADOS.REVISION]: 0,
      [ESTADOS.RECHAZADA]: 0,
    };
    for (const f of this.#facturas) {
      porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
    }

    const activas = this.activas;
    const subtotal = activas.reduce((acumulado, f) => acumulado + (f.subtotal ?? 0), 0);
    const impuesto = activas.reduce((acumulado, f) => acumulado + (f.impuesto ?? 0), 0);
    const totalMonto = activas.reduce((acumulado, f) => acumulado + (f.total ?? 0), 0);

    const montoRechazado = this.rechazadas.reduce(
      (acumulado, f) => acumulado + (f.total ?? 0),
      0,
    );

    const monedas = [...new Set(this.#facturas.map((f) => f.monedaOriginal ?? MONEDA_LOCAL))];

    const porProveedor = [...new Set(this.#facturas.map((f) => f.proveedor))]
      .map((proveedor) => {
        const propias = this.#facturas.filter((f) => f.proveedor === proveedor);
        const totalProveedor = propias
          .filter((f) => f.estado !== ESTADOS.RECHAZADA)
          .reduce((acumulado, f) => acumulado + (f.total ?? 0), 0);
        return { proveedor, facturas: propias.length, total: totalProveedor };
      })
      .sort((a, b) => b.total - a.total);

    return {
      generadoEn: new Date().toISOString(),
      totalFacturas: total,
      porEstado,
      subtotal,
      impuesto,
      total: totalMonto,
      montoRechazado,
      tasaImpuestoEfectiva: subtotal > 0 ? Number(((impuesto / subtotal) * 100).toFixed(2)) : 0,
      monedas,
      porProveedor,
      facturas: this.#facturas.map((f) => ({
        numero: f.numero,
        tipo: f.tipo,
        proveedor: f.proveedor,
        cedulaJuridica: f.cedulaJuridica,
        fecha: f.fecha,
        estado: f.estado,
        nivel: f.nivel,
        motivo: f.motivo,
        subtotal: f.subtotal ?? 0,
        impuesto: f.impuesto ?? 0,
        total: f.total ?? 0,
        moneda: f.moneda ?? MONEDA_LOCAL,
        monedaOriginal: f.monedaOriginal ?? null,
        tipoCambio: f.tipoCambio ?? null,
        subtotalOriginal: f.subtotalOriginal ?? null,
        referencia: Boolean(f.referencia),
        lineas: f.lineas ?? [],
      })),
    };
  }
}
