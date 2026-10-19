/* ============================================================================
 * FacturaBot · Capa de presentación (paleta + render HTML)
 * ----------------------------------------------------------------------------
 * Genera el reporte visual del lote. El mismo renderizador se usa:
 *   - dentro del nodo Code "Reporte del lote" (nodo 9) para producir el HTML
 *     y el binario descargable, y
 *   - en tools/build.mjs para generar assets/reporte-lote.html.
 *
 * PALETA "Midnight Ledger": azul profundo + teal, sobre fondo casi negro,
 * con verde/ámbar/rojo reservados exclusivamente para los estados de negocio.
 * ========================================================================== */

import { ESTADOS } from './constantes.js';

export const PALETA = Object.freeze({
  base: Object.freeze({
    fondo: '#070B14',
    superficie: '#0D1523',
    superficie2: '#131E33',
    borde: '#1E2B47',
    texto: '#E9EFFA',
    suave: '#8DA0C0',
  }),
  marca: Object.freeze({
    primario: '#3B82F6',
    primario2: '#60A5FA',
    teal: '#2DD4BF',
    violeta: '#A78BFA',
  }),
  estado: Object.freeze({
    [ESTADOS.APROBADA]: Object.freeze({ base: '#22C55E', texto: '#86EFAC', fondo: 'rgba(34,197,94,.12)' }),
    [ESTADOS.REVISION]: Object.freeze({ base: '#F59E0B', texto: '#FCD34D', fondo: 'rgba(245,158,11,.12)' }),
    [ESTADOS.RECHAZADA]: Object.freeze({ base: '#EF4444', texto: '#FCA5A5', fondo: 'rgba(239,68,68,.12)' }),
  }),
});

/** Formatea un monto en colones: 2622800 -> "₡2,622,800". */
export function formatearMoneda(valor) {
  const numero = Number(valor) || 0;
  const negativo = numero < 0;
  const entero = Math.abs(Math.round(numero)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negativo ? '-' : ''}₡${entero}`;
}

/** Escapa texto para insertarlo con seguridad dentro del HTML. */
export function escaparHTML(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Codifica un texto a Base64 sin depender de Buffer ni btoa (no siempre
 * disponibles dentro del sandbox del nodo Code de n8n). Convierte a UTF-8
 * con encodeURIComponent y luego aplica el algoritmo Base64 estándar.
 */
export function codificarBase64(texto) {
  const binario = encodeURIComponent(texto).replace(
    /%([0-9A-F]{2})/g,
    (_, hex) => String.fromCharCode(parseInt(hex, 16)),
  );
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let salida = '';

  for (let indice = 0; indice < binario.length; indice += 3) {
    const byte1 = binario.charCodeAt(indice);
    const byte2 = indice + 1 < binario.length ? binario.charCodeAt(indice + 1) : NaN;
    const byte3 = indice + 2 < binario.length ? binario.charCodeAt(indice + 2) : NaN;
    const bloque = (byte1 << 16) | ((Number.isNaN(byte2) ? 0 : byte2) << 8) | (Number.isNaN(byte3) ? 0 : byte3);

    salida += alfabeto[(bloque >> 18) & 63];
    salida += alfabeto[(bloque >> 12) & 63];
    salida += Number.isNaN(byte2) ? '=' : alfabeto[(bloque >> 6) & 63];
    salida += Number.isNaN(byte3) ? '=' : alfabeto[bloque & 63];
  }

  return salida;
}

const ETIQUETA_ESTADO = {
  [ESTADOS.APROBADA]: 'Aprobada',
  [ESTADOS.REVISION]: 'En revisión',
  [ESTADOS.RECHAZADA]: 'Rechazada',
};

const ORDEN_ESTADOS = [ESTADOS.APROBADA, ESTADOS.REVISION, ESTADOS.RECHAZADA];

/**
 * Renderiza el reporte completo en HTML autocontenido (sin dependencias
 * externas: ni CDN, ni fuentes remotas, ni scripts).
 * @param {object} resumen salida de ReporteLote.resumen()
 * @param {object} acciones mapa estado -> acción del workflow
 */
export function renderReporteHTML(resumen, acciones = {}) {
  const facturas = resumen.facturas ?? [];
  const porEstado = resumen.porEstado ?? {};
  const total = resumen.totalFacturas ?? 0;
  const maximo = facturas.reduce((mayor, f) => Math.max(mayor, f.total ?? 0), 0) || 1;

  const segmentos = ORDEN_ESTADOS.map((estado) => {
    const porcentaje = total > 0 ? ((porEstado[estado] ?? 0) / total) * 100 : 0;
    const color = PALETA.estado[estado]?.base ?? '#3B82F6';
    return `<span class="seg" style="width:${porcentaje.toFixed(2)}%;background:${color}" title="${ETIQUETA_ESTADO[estado]}: ${porEstado[estado] ?? 0}"></span>`;
  }).join('');

  const leyenda = ORDEN_ESTADOS.map((estado) => {
    const color = PALETA.estado[estado]?.base ?? '#3B82F6';
    const texto = PALETA.estado[estado]?.texto ?? '#E9EFFA';
    return `<span class="chip"><i style="background:${color}"></i>${ETIQUETA_ESTADO[estado]}<b>${porEstado[estado] ?? 0}</b></span>`;
  }).join('');

  const filas = facturas
    .map((factura) => {
      const estado = factura.estado ?? ESTADOS.RECHAZADA;
      const color = PALETA.estado[estado]?.base ?? '#3B82F6';
      const ancho = Math.max(2, Math.round(((factura.total ?? 0) / maximo) * 100));
      const detalle =
        factura.tipo === 'extranjera' && factura.tipoCambio
          ? `<span class="nota">${escaparHTML(factura.monedaOriginal ?? '')} ${Number(factura.subtotalOriginal ?? 0).toLocaleString('en-US')} × ${factura.tipoCambio}</span>`
          : '';
      const motivo = factura.motivo
        ? `<div class="motivo">${escaparHTML(factura.motivo)}</div>`
        : '';
      const referencia = factura.referencia
        ? '<span class="marca-ref">monto referencial · no suma al lote</span>'
        : '';
      return `<tr style="--fila:${color}">
        <td class="num"><b>${escaparHTML(factura.numero ?? '—')}</b>${motivo}</td>
        <td><span class="tipo tipo--${escaparHTML(factura.tipo ?? '')}">${escaparHTML(factura.tipo ?? '—')}</span>${detalle}</td>
        <td>${escaparHTML(factura.proveedor ?? '—')}<div class="sub">${escaparHTML(factura.cedulaJuridica ?? '')}</div></td>
        <td class="fecha">${escaparHTML(factura.fecha ?? '—')}</td>
        <td><span class="pill pill--${estado}">${ETIQUETA_ESTADO[estado] ?? estado}</span></td>
        <td class="num">${formatearMoneda(factura.subtotal)}</td>
        <td class="num">${formatearMoneda(factura.impuesto)}</td>
        <td class="num total">${formatearMoneda(factura.total)}<div class="barra"><span style="width:${ancho}%;background:${color}"></span></div>${referencia}</td>
      </tr>`;
    })
    .join('\n');

  const tarjetasAccion = ORDEN_ESTADOS.map((estado) => {
    const color = PALETA.estado[estado]?.base ?? '#3B82F6';
    const fondo = PALETA.estado[estado]?.fondo ?? 'rgba(59,130,246,.12)';
    const texto = PALETA.estado[estado]?.texto ?? '#E9EFFA';
    return `<div class="accion" style="--color:${color};--fondo:${fondo};--texto:${texto}">
        <span class="accion__estado">${ETIQUETA_ESTADO[estado]}</span>
        <span class="accion__cuenta">${porEstado[estado] ?? 0} factura${(porEstado[estado] ?? 0) === 1 ? '' : 's'}</span>
        <span class="accion__texto">${escaparHTML(acciones[estado] ?? '—')}</span>
      </div>`;
  }).join('');

  const generadas = new Date(resumen.generadoEn ?? Date.now());
  const sello = Number.isNaN(generadas.getTime())
    ? new Date().toISOString().slice(0, 16).replace('T', ' ')
    : generadas.toISOString().slice(0, 16).replace('T', ' ');

  const proveedorFilas = (resumen.porProveedor ?? [])
    .map(
      (p) =>
        `<tr><td>${escaparHTML(p.proveedor)}</td><td class="num">${p.facturas}</td><td class="num">${formatearMoneda(p.total)}</td></tr>`,
    )
    .join('\n');

  const muestras = [
    ['Fondo', PALETA.base.fondo],
    ['Superficie', PALETA.base.superficie],
    ['Borde', PALETA.base.borde],
    ['Primario', PALETA.marca.primario],
    ['Teal', PALETA.marca.teal],
    ['Violeta', PALETA.marca.violeta],
    ['Aprobada', PALETA.estado[ESTADOS.APROBADA].base],
    ['Revisión', PALETA.estado[ESTADOS.REVISION].base],
    ['Rechazada', PALETA.estado[ESTADOS.RECHAZADA].base],
  ]
    .map(
      ([nombre, hex]) =>
        `<div class="swatch"><span class="swatch__color" style="background:${hex}"></span><span class="swatch__name">${nombre}</span><span class="swatch__hex">${hex}</span></div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FacturaBot · Reporte del lote</title>
<style>
  :root{
    --fondo:${PALETA.base.fondo};
    --sup:${PALETA.base.superficie};
    --sup2:${PALETA.base.superficie2};
    --borde:${PALETA.base.borde};
    --texto:${PALETA.base.texto};
    --suave:${PALETA.base.suave};
    --primario:${PALETA.marca.primario};
    --primario2:${PALETA.marca.primario2};
    --teal:${PALETA.marca.teal};
    --violeta:${PALETA.marca.violeta};
    --radio:16px;
    --sombra:0 24px 60px -30px rgba(2,6,23,.95);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    background:
      radial-gradient(1100px 520px at 12% -8%, rgba(59,130,246,.16), transparent 60%),
      radial-gradient(900px 480px at 92% 0%, rgba(45,212,191,.12), transparent 55%),
      var(--fondo);
    color:var(--texto);
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
    line-height:1.5;
    padding:36px 20px 56px;
  }
  .hoja{max-width:1180px;margin:0 auto}

  /* ---------- cabecera ---------- */
  .cabecera{
    display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-between;
    background:linear-gradient(140deg,rgba(19,30,51,.96),rgba(13,21,35,.96));
    border:1px solid var(--borde);border-radius:var(--radio);
    padding:24px 26px;box-shadow:var(--sombra);position:relative;overflow:hidden;
  }
  .cabecera::before{
    content:'';position:absolute;inset:0 0 auto 0;height:3px;
    background:linear-gradient(90deg,var(--primario),var(--teal),var(--violeta));
  }
  .marca{display:flex;align-items:center;gap:16px}
  .logo{
    width:52px;height:52px;flex:none;border-radius:14px;
    display:grid;place-items:center;font-weight:800;letter-spacing:.5px;font-size:18px;
    color:#06121f;background:linear-gradient(135deg,var(--primario2),var(--teal));
    box-shadow:0 10px 26px -12px rgba(45,212,191,.8);
  }
  h1{font-size:23px;font-weight:700;letter-spacing:-.3px}
  .sub{color:var(--suave);font-size:13.5px}
  .sello{
    font-size:12.5px;color:var(--suave);border:1px solid var(--borde);
    background:rgba(7,11,20,.55);border-radius:999px;padding:7px 14px;white-space:nowrap;
  }

  /* ---------- KPIs ---------- */
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:18px}
  .kpi{
    background:linear-gradient(160deg,var(--sup2),var(--sup));
    border:1px solid var(--borde);border-radius:var(--radio);padding:18px 18px 16px;
    box-shadow:var(--sombra);position:relative;overflow:hidden;
  }
  .kpi::after{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--acento,var(--primario))}
  .kpi__etiqueta{display:block;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--suave)}
  .kpi__valor{display:block;font-size:27px;font-weight:700;margin-top:6px;letter-spacing:-.6px;
    font-variant-numeric:tabular-nums}
  .kpi__nota{display:block;font-size:12px;color:var(--suave);margin-top:3px}

  /* ---------- paneles ---------- */
  .panel{
    background:var(--sup);border:1px solid var(--borde);border-radius:var(--radio);
    padding:22px 24px;margin-top:18px;box-shadow:var(--sombra);
  }
  .panel h2{font-size:15.5px;font-weight:650;letter-spacing:.01em;margin-bottom:16px;display:flex;align-items:center;gap:9px}
  .panel h2::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--teal);box-shadow:0 0 0 4px rgba(45,212,191,.14)}

  /* ---------- barra de distribución ---------- */
  .barra-dist{display:flex;height:14px;border-radius:999px;overflow:hidden;background:var(--sup2);border:1px solid var(--borde)}
  .seg{display:block;height:100%}
  .leyenda{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}
  .chip{display:inline-flex;align-items:center;gap:8px;background:var(--sup2);border:1px solid var(--borde);
    border-radius:999px;padding:6px 13px;font-size:12.5px;color:var(--suave)}
  .chip i{width:9px;height:9px;border-radius:50%}
  .chip b{color:var(--texto);font-variant-numeric:tabular-nums}

  /* ---------- tabla ---------- */
  .tabla-scroll{overflow-x:auto;border-radius:12px;border:1px solid var(--borde)}
  table{width:100%;border-collapse:collapse;min-width:860px}
  thead th{
    background:var(--sup2);color:var(--suave);font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;
    text-align:left;padding:12px 14px;font-weight:600;border-bottom:1px solid var(--borde);white-space:nowrap;
  }
  tbody td{padding:13px 14px;border-bottom:1px solid rgba(30,43,71,.6);vertical-align:top;font-size:13.5px}
  tbody tr:last-child td{border-bottom:none}
  tbody tr{position:relative}
  tbody tr td:first-child{box-shadow:inset 3px 0 0 var(--fila,var(--primario))}
  tbody tr:hover{background:rgba(59,130,246,.05)}
  .num{font-variant-numeric:tabular-nums;white-space:nowrap}
  .total{font-weight:650}
  .fecha{color:var(--suave);white-space:nowrap}
  .sub,.nota{display:block;font-size:11.5px;color:var(--suave);margin-top:3px}
  .motivo{font-size:11.5px;color:#FCA5A5;margin-top:5px;max-width:320px}
  .marca-ref{display:block;font-size:11px;color:var(--suave);margin-top:4px;font-style:italic}

  .pill{display:inline-block;padding:4px 11px;border-radius:999px;font-size:11.5px;font-weight:600;white-space:nowrap}
  .pill--aprobada{background:rgba(34,197,94,.13);color:${PALETA.estado[ESTADOS.APROBADA].texto};border:1px solid rgba(34,197,94,.3)}
  .pill--revision{background:rgba(245,158,11,.13);color:${PALETA.estado[ESTADOS.REVISION].texto};border:1px solid rgba(245,158,11,.3)}
  .pill--rechazada{background:rgba(239,68,68,.13);color:${PALETA.estado[ESTADOS.RECHAZADA].texto};border:1px solid rgba(239,68,68,.3)}

  .tipo{display:inline-block;padding:3px 10px;border-radius:7px;font-size:11.5px;font-weight:600;
    background:rgba(59,130,246,.12);color:#93C5FD;border:1px solid rgba(59,130,246,.25)}
  .tipo--exenta{background:rgba(167,139,250,.12);color:#C4B5FD;border-color:rgba(167,139,250,.25)}
  .tipo--extranjera{background:rgba(45,212,191,.12);color:#5EEAD4;border-color:rgba(45,212,191,.25)}
  .tipo--credito{background:rgba(239,68,68,.12);color:#FCA5A5;border-color:rgba(239,68,68,.25)}

  .barra{display:block;height:4px;border-radius:999px;background:var(--sup2);margin-top:6px;overflow:hidden;width:110px}
  .barra span{display:block;height:100%;border-radius:999px}

  /* ---------- acciones ---------- */
  .acciones{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}
  .accion{background:var(--fondo);border:1px solid var(--borde);border-left:3px solid var(--color);
    border-radius:12px;padding:15px 16px;display:flex;flex-direction:column;gap:4px}
  .accion__estado{font-size:13px;font-weight:650;color:var(--texto)}
  .accion__cuenta{font-size:11.5px;color:var(--suave)}
  .accion__texto{margin-top:7px;font-size:12.5px;color:var(--texto);background:var(--fondo);
    display:inline-block;padding:5px 11px;border-radius:8px;border:1px solid var(--borde)}

  /* ---------- pie / paleta ---------- */
  .paleta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
  .swatch{background:var(--sup2);border:1px solid var(--borde);border-radius:11px;padding:10px 12px;display:flex;align-items:center;gap:9px}
  .swatch__color{width:22px;height:22px;border-radius:7px;border:1px solid rgba(255,255,255,.12);flex:none}
  .swatch__name{font-size:12px;color:var(--suave)}
  .swatch__hex{margin-left:auto;font-size:11.5px;color:var(--texto);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .firma{margin-top:18px;text-align:center;color:var(--suave);font-size:12px}

  @media (max-width:640px){
    body{padding:20px 12px 40px}
    .cabecera{padding:20px}
    .kpi__valor{font-size:23px}
  }
</style>
</head>
<body>
<div class="hoja">

  <header class="cabecera">
    <div class="marca">
      <div class="logo">FB</div>
      <div>
        <h1>FacturaBot</h1>
        <p class="sub">Reporte del lote · Programación Orientada a Objetos en el nodo Code de n8n</p>
      </div>
    </div>
    <div class="sello">Generado: ${sello}</div>
  </header>

  <section class="kpis">
    <div class="kpi" style="--acento:${PALETA.marca.primario}">
      <span class="kpi__etiqueta">Facturas procesadas</span>
      <span class="kpi__valor">${total}</span>
      <span class="kpi__nota">lote completo</span>
    </div>
    <div class="kpi" style="--acento:${PALETA.estado[ESTADOS.APROBADA].base}">
      <span class="kpi__etiqueta">Aprobadas</span>
      <span class="kpi__valor">${porEstado[ESTADOS.APROBADA] ?? 0}</span>
      <span class="kpi__nota">${escaparHTML(acciones[ESTADOS.APROBADA] ?? '')}</span>
    </div>
    <div class="kpi" style="--acento:${PALETA.estado[ESTADOS.REVISION].base}">
      <span class="kpi__etiqueta">En revisión</span>
      <span class="kpi__valor">${porEstado[ESTADOS.REVISION] ?? 0}</span>
      <span class="kpi__nota">${escaparHTML(acciones[ESTADOS.REVISION] ?? '')}</span>
    </div>
    <div class="kpi" style="--acento:${PALETA.estado[ESTADOS.RECHAZADA].base}">
      <span class="kpi__etiqueta">Rechazadas</span>
      <span class="kpi__valor">${porEstado[ESTADOS.RECHAZADA] ?? 0}</span>
      <span class="kpi__nota">${escaparHTML(acciones[ESTADOS.RECHAZADA] ?? '')}</span>
    </div>
    <div class="kpi" style="--acento:${PALETA.marca.teal}">
      <span class="kpi__etiqueta">Total a registrar</span>
      <span class="kpi__valor">${formatearMoneda(resumen.total)}</span>
      <span class="kpi__nota">excluye facturas rechazadas</span>
    </div>
    <div class="kpi" style="--acento:${PALETA.marca.violeta}">
      <span class="kpi__etiqueta">IVA acumulado</span>
      <span class="kpi__valor">${formatearMoneda(resumen.impuesto)}</span>
      <span class="kpi__nota">tasa efectiva ${resumen.tasaImpuestoEfectiva ?? 0}%</span>
    </div>
  </section>

  <section class="panel">
    <h2>Distribución del lote por estado</h2>
    <div class="barra-dist">${segmentos}</div>
    <div class="leyenda">${leyenda}</div>
  </section>

  <section class="panel">
    <h2>Detalle de facturas</h2>
    <div class="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th>Factura</th><th>Tipo</th><th>Proveedor</th><th>Fecha</th>
            <th>Estado</th><th>Subtotal</th><th>IVA</th><th>Total</th>
          </tr>
        </thead>
        <tbody>
${filas}
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel">
    <h2>Acciones disparadas por cada rama</h2>
    <div class="acciones">${tarjetasAccion}</div>
  </section>

  <section class="panel">
    <h2>Totales por proveedor</h2>
    <div class="tabla-scroll">
      <table>
        <thead><tr><th>Proveedor</th><th>Facturas</th><th>Total</th></tr></thead>
        <tbody>
${proveedorFilas}
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel">
    <h2>Paleta "Midnight Ledger"</h2>
    <div class="paleta">${muestras}</div>
  </section>

  <p class="firma">FacturaBot · ${total} facturas · ${escaparHTML((resumen.monedas ?? []).join(' · '))} · generado el ${sello}</p>
</div>
</body>
</html>`;
}
