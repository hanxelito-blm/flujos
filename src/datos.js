/* ============================================================================
 * FacturaBot · Datos de prueba (nodo 2 · "Datos de prueba")
 * ----------------------------------------------------------------------------
 * Lote de 7 facturas diseñado para ejercitar las TRES rutas del nodo Switch:
 *
 *   F-001  nacional   -> APROBADA    (camino feliz, IVA 13 %)
 *   F-002  exenta     -> APROBADA    (exención por servicios de salud)
 *   F-003  extranjera  -> APROBADA    (conversión de USD a colones)
 *   F-004  nacional   -> RECHAZADA   (cédula jurídica con formato inválido)
 *   F-005  nacional   -> APROBADA    (monto alto, IVA 13 %)
 *   F-006  credito    -> RECHAZADA   (tipo documental no soportado)
 *   F-007  nacional   -> REVISIÓN    (fecha en el futuro)
 * ========================================================================== */

export const lote = [
  { numero: 'F-001', tipo: 'nacional', proveedor: 'Distribuidora Central', cedulaJuridica: '3-101-123456', fecha: '2026-09-10', lineas: [{ descripcion: 'Resmas de papel', cantidad: 10, precioUnitario: 5000 }] },
  { numero: 'F-002', tipo: 'exenta', proveedor: 'Clínica San José', cedulaJuridica: '3-102-654321', fecha: '2026-09-12', motivoExencion: 'Servicios de salud', lineas: [{ descripcion: 'Exámenes médicos', cantidad: 2, precioUnitario: 75000 }] },
  { numero: 'F-003', tipo: 'extranjera', proveedor: 'Cloud Services Inc.', cedulaJuridica: '3-012-000111', fecha: '2026-09-15', moneda: 'USD', tipoCambio: 510, lineas: [{ descripcion: 'Licencia anual', cantidad: 1, precioUnitario: 2500 }] },
  { numero: 'F-004', tipo: 'nacional', proveedor: 'Ferretería El Clavo', cedulaJuridica: '123', fecha: '2026-09-20', lineas: [{ descripcion: 'Tornillos', cantidad: 100, precioUnitario: 50 }] },
  { numero: 'F-005', tipo: 'nacional', proveedor: 'TecnoMundo', cedulaJuridica: '3-101-777888', fecha: '2026-09-25', lineas: [{ descripcion: 'Laptops', cantidad: 4, precioUnitario: 250000 }] },
  { numero: 'F-006', tipo: 'credito', proveedor: 'Proveedor X', cedulaJuridica: '3-101-999000', fecha: '2026-09-28', lineas: [{ descripcion: 'Varios', cantidad: 1, precioUnitario: 10000 }] },
  { numero: 'F-007', tipo: 'nacional', proveedor: 'Imprenta Futura', cedulaJuridica: '3-101-444555', fecha: '2030-01-15', lineas: [{ descripcion: 'Volantes', cantidad: 500, precioUnitario: 20 }] },
];
