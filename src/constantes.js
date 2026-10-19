/* ============================================================================
 * FacturaBot · Constantes compartidas por el workflow
 * ----------------------------------------------------------------------------
 * ESTADOS  -> valores exactos que evalúa el nodo Switch ({{ $json.estado }}).
 * ACCIONES -> texto que agrega cada nodo Set ("Aprobada" / "Revisión" /
 *             "Rechazada"). Deben coincidir con los nodos del workflow.
 * ========================================================================== */

export const ESTADOS = {
  APROBADA: 'aprobada',
  REVISION: 'revision',
  RECHAZADA: 'rechazada',
};

export const ACCIONES = {
  [ESTADOS.APROBADA]: 'Registrar en contabilidad',
  [ESTADOS.REVISION]: 'Enviar a gerencia',
  [ESTADOS.RECHAZADA]: 'Devolver al proveedor',
};

export const MONEDA_LOCAL = 'CRC';
