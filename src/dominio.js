/* ============================================================================
 * FacturaBot · Capa de dominio
 * ----------------------------------------------------------------------------
 * Práctica: "Programación Orientada a Objetos en el nodo Code de n8n"
 *
 * Este archivo es la FUENTE ÚNICA de verdad del dominio. El script
 * tools/build.mjs lo concatena dentro del nodo Code "Procesar facturas" y
 * tools/verificar.mjs lo ejecuta con Node para comprobar los resultados.
 *
 * Pilares de POO implementados aquí:
 *   1. ENCAPSULAMIENTO  -> campos privados (#) + getters de solo lectura
 *   2. HERENCIA         -> extends / super()
 *   3. POLIMORFISMO     -> sobrescritura de calcularImpuesto(), total(), toJSON()
 *   4. ABSTRACCIÓN      -> Factura es abstracta: calcularImpuesto() lanza Error
 *
 * Patrón adicional: FACTORY (FabricaFacturas) para crear la subclase correcta.
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * Error de negocio: transporta un código estable para poder clasificar el
 * rechazo sin depender de textos libres.
 * ------------------------------------------------------------------------ */
export class ErrorFactura extends Error {
  constructor(mensaje, codigo = 'FACTURA_INVALIDA') {
    super(mensaje);
    this.name = 'ErrorFactura';
    this.codigo = codigo;
  }
}

/* ===========================================================================
 * 1) LineaFactura — ENCAPSULAMIENTO
 * ===========================================================================
 * No expone estado interno: la única forma de leer sus datos es a través de
 * getters, y la única forma de calcular su valor es el método subtotal().
 * ========================================================================= */
export class LineaFactura {
  #descripcion;
  #cantidad;
  #precioUnitario;

  constructor({ descripcion, cantidad, precioUnitario }) {
    if (typeof descripcion !== 'string' || descripcion.trim() === '') {
      throw new ErrorFactura(
        'La descripción de la línea es obligatoria.',
        'LINEA_SIN_DESCRIPCION',
      );
    }
    if (!Number.isFinite(Number(cantidad)) || Number(cantidad) <= 0) {
      throw new ErrorFactura(
        `La cantidad de "${descripcion.trim()}" debe ser mayor que 0.`,
        'CANTIDAD_INVALIDA',
      );
    }
    if (!Number.isFinite(Number(precioUnitario)) || Number(precioUnitario) <= 0) {
      throw new ErrorFactura(
        `El precio unitario de "${descripcion.trim()}" debe ser mayor que 0.`,
        'PRECIO_INVALIDO',
      );
    }

    this.#descripcion = descripcion.trim();
    this.#cantidad = Number(cantidad);
    this.#precioUnitario = Number(precioUnitario);
  }

  get descripcion() {
    return this.#descripcion;
  }

  get cantidad() {
    return this.#cantidad;
  }

  get precioUnitario() {
    return this.#precioUnitario;
  }

  /** Valor de la línea: cantidad × precio unitario. */
  subtotal() {
    return this.#cantidad * this.#precioUnitario;
  }

  toJSON() {
    return {
      descripcion: this.#descripcion,
      cantidad: this.#cantidad,
      precioUnitario: this.#precioUnitario,
      subtotal: this.subtotal(),
    };
  }

  /**
   * Subtotal "tolerante" usado para facturas RECHAZADAS: ignora las líneas con
   * datos inválidos en lugar de lanzar. Permite mostrar cuánto dinero quedó
   * en disputa sin que el lote reviente.
   */
  static subtotalDe(lineas = []) {
    if (!Array.isArray(lineas)) return 0;
    return lineas.reduce((acumulado, linea) => {
      const cantidad = Number(linea?.cantidad);
      const precio = Number(linea?.precioUnitario);
      if (!Number.isFinite(cantidad) || !Number.isFinite(precio)) return acumulado;
      if (cantidad <= 0 || precio <= 0) return acumulado;
      return acumulado + cantidad * precio;
    }, 0);
  }
}

/* ===========================================================================
 * 2) Factura — CLASE BASE ABSTRACTA (abstracción + encapsulamiento)
 * ===========================================================================
 * - El detalle de líneas es privado (#lineas) y se expone con el getter
 *   `lineas`, que devuelve una copia congelada (inmutable para el exterior).
 * - calcularImpuesto() es un método abstracto: lanza Error si alguien intenta
 *   usar la base directamente.
 * - El constructor bloquea la instanciación directa de la clase abstracta.
 * ========================================================================= */
export class Factura {
  #numero;
  #proveedor;
  #cedulaJuridica;
  #fecha;
  #lineas;

  constructor({ numero, proveedor, cedulaJuridica, fecha, lineas = [] }) {
    // Abstracción real: la base no se puede instanciar, hay que usar una subclase.
    if (new.target === Factura) {
      throw new TypeError(
        'Factura es una clase abstracta: use FabricaFacturas.crear() o una subclase.',
      );
    }

    this.#numero = numero ?? null;
    this.#proveedor = proveedor ?? null;
    this.#cedulaJuridica = cedulaJuridica ?? null;
    this.#fecha = fecha instanceof Date ? fecha : new Date(fecha);

    // Composición: el detalle crudo se convierte en objetos LineaFactura
    // (con datos inválidos, el constructor de LineaFactura lanza ErrorFactura).
    this.#lineas = Object.freeze(
      (Array.isArray(lineas) ? lineas : []).map((linea) =>
        linea instanceof LineaFactura ? linea : new LineaFactura(linea),
      ),
    );
  }

  get lineas() {
    return this.#lineas;
  }

  get numero() {
    return this.#numero;
  }

  get proveedor() {
    return this.#proveedor;
  }

  get cedulaJuridica() {
    return this.#cedulaJuridica;
  }

  get fecha() {
    return Number.isNaN(this.#fecha.getTime())
      ? null
      : this.#fecha.toISOString().slice(0, 10);
  }

  /** Tipo documental. Se sobrescribe en cada subclase (polimorfismo). */
  get tipo() {
    return 'base';
  }

  /** Tasa de impuesto vigente. Se sobrescribe en cada subclase. */
  get tasaImpuesto() {
    return 0;
  }

  /** Suma de las líneas, en la moneda original de la factura. */
  subtotal() {
    return this.#lineas.reduce((acumulado, linea) => acumulado + linea.subtotal(), 0);
  }

  /**
   * El subtotal expresado en colones (moneda nacional de Costa Rica).
   * En la base la moneda original ya es CRC; FacturaExtranjera lo sobrescribe
   * para aplicar el tipo de cambio.
   */
  subtotalColones() {
    return this.subtotal();
  }

  /** MÉTODO ABSTRACTO: cada subclase define su propia regla de IVA. */
  calcularImpuesto() {
    throw new Error(
      'calcularImpuesto() es un método abstracto: debe implementarse en la subclase.',
    );
  }

  /** Total en colones. Se sobrescribe en FacturaExtranjera (conversión). */
  total() {
    return this.subtotalColones() + this.calcularImpuesto();
  }

  toJSON() {
    return {
      numero: this.#numero,
      tipo: this.tipo,
      proveedor: this.#proveedor,
      cedulaJuridica: this.#cedulaJuridica,
      fecha: this.fecha,
      lineas: this.#lineas.map((linea) => linea.toJSON()),
      subtotal: this.subtotalColones(),
      impuesto: this.calcularImpuesto(),
      total: this.total(),
      moneda: 'CRC',
    };
  }
}

/* ===========================================================================
 * 3) FacturaNacional — HERENCIA + POLIMORFISMO (IVA 13 %)
 * ========================================================================= */
export class FacturaNacional extends Factura {
  static TASA_IVA = 0.13;

  constructor(datos) {
    super(datos);
  }

  get tipo() {
    return 'nacional';
  }

  get tasaImpuesto() {
    return FacturaNacional.TASA_IVA;
  }

  /** POLIMORFISMO: aquí vive la regla del 13 %. */
  calcularImpuesto() {
    return Math.round(this.subtotal() * this.tasaImpuesto);
  }
}

/* ===========================================================================
 * 4) FacturaExenta — HERENCIA + POLIMORFISMO (IVA 0 % + motivo de exención)
 * ========================================================================= */
export class FacturaExenta extends Factura {
  #motivoExencion;

  constructor(datos) {
    super(datos);
    this.#motivoExencion = String(datos?.motivoExencion ?? '').trim();
  }

  get motivoExencion() {
    return this.#motivoExencion;
  }

  get tipo() {
    return 'exenta';
  }

  get tasaImpuesto() {
    return 0;
  }

  /** POLIMORFISMO: exenta, sin IVA. */
  calcularImpuesto() {
    return 0;
  }
}

/* ===========================================================================
 * 5) FacturaExtranjera — HERENCIA + POLIMORFISMO (IVA 0 % y total en ₡)
 * ===========================================================================
 * El IVA es 0 (exportación de servicios) y el total se convierte a colones
 * usando el tipo de cambio de la factura.
 * ========================================================================= */
export class FacturaExtranjera extends Factura {
  #moneda;
  #tipoCambio;

  constructor(datos) {
    super(datos);
    this.#moneda = String(datos?.moneda ?? '').toUpperCase();
    this.#tipoCambio = Number(datos?.tipoCambio);
  }

  get moneda() {
    return this.#moneda;
  }

  get tipoCambio() {
    return this.#tipoCambio;
  }

  get tipo() {
    return 'extranjera';
  }

  get tasaImpuesto() {
    return 0;
  }

  /** POLIMORFISMO: exenta de IVA por exportación de servicios. */
  calcularImpuesto() {
    return 0;
  }

  /** POLIMORFISMO: convierte el subtotal a colones con el tipo de cambio. */
  subtotalColones() {
    return Math.round(this.subtotal() * this.#tipoCambio);
  }

  /** POLIMORFISMO: sobrescribe total() para entregar el importe en colones. */
  total() {
    return this.subtotalColones() + this.calcularImpuesto();
  }

  toJSON() {
    return {
      ...super.toJSON(),
      monedaOriginal: this.#moneda,
      tipoCambio: this.#tipoCambio,
      subtotalOriginal: this.subtotal(),
    };
  }
}

/* ===========================================================================
 * 6) FabricaFacturas — PATRÓN FACTORY
 * ===========================================================================
 * Decide la subclase a instanciar a partir de `datos.tipo`.
 * Se usa un REGISTRO (mapa tipo → clase) en lugar de una cadena de if/else:
 *  - no hay `if` por tipo de factura (la prohibition de la guía),
 *  - es extensible: registrar un tipo nuevo es una línea, no un refactor.
 * ========================================================================= */
export class FabricaFacturas {
  static #registro = {
    nacional: FacturaNacional,
    exenta: FacturaExenta,
    extranjera: FacturaExtranjera,
  };

  /** Tipos soportados por el workflow. */
  static tipos() {
    return Object.keys(FabricaFacturas.#registro);
  }

  /** ¿El workflow sabe procesar este tipo documental? */
  static soporta(tipo) {
    const clave = String(tipo ?? '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(FabricaFacturas.#registro, clave);
  }

  /** Registra un nuevo tipo (principio abierto/cerrado). */
  static registrar(tipo, clase) {
    FabricaFacturas.#registro[String(tipo).trim().toLowerCase()] = clase;
    return FabricaFacturas;
  }

  /**
   * Punto de entrada único: devuelve la instancia de la subclase correcta.
   * @throws {ErrorFactura} si el tipo no está soportado.
   */
  static crear(datos) {
    const clave = String(datos?.tipo ?? '').trim().toLowerCase();
    const Clase = FabricaFacturas.#registro[clave];

    if (!Clase) {
      throw new ErrorFactura(
        `El tipo "${datos?.tipo}" no está soportado. Tipos válidos: ${FabricaFacturas.tipos().join(', ')}.`,
        'TIPO_NO_SOPORTADO',
      );
    }

    return new Clase(datos);
  }
}

/* ===========================================================================
 * 7) ValidadorFactura — REGLAS DE NEGOCIO CON SEVERIDAD
 * ===========================================================================
 * Cada regla se clasifica como:
 *   ERROR      -> la factura se RECHAZA (se devuelve al proveedor).
 *   ADVERTENCIA -> la factura pasa a REVISIÓN (la ve gerencia).
 * Sin observaciones -> la factura queda APROBADA.
 * ========================================================================= */
export class ValidadorFactura {
  /** Cédula jurídica costarricense: 3-XXX-XXXXXX (9 dígitos con guiones). */
  static CEDULA_COSTARRICENSE = /^3-\d{3}-\d{6}$/;

  static validar(datos = {}) {
    const errores = [];
    const advertencias = [];

    // 1) Número de factura: obligatorio.
    if (!datos.numero || String(datos.numero).trim() === '') {
      errores.push('El número de factura es obligatorio.');
    }

    // 2) Cédula jurídica costarricense: obligatoria y con formato válido.
    const cedula = String(datos.cedulaJuridica ?? '').trim();
    if (cedula === '') {
      errores.push('La cédula jurídica del proveedor es obligatoria.');
    } else if (!ValidadorFactura.CEDULA_COSTARRICENSE.test(cedula)) {
      errores.push(
        `La cédula jurídica "${cedula}" no cumple el formato 3-XXX-XXXXXX.`,
      );
    }

    // 3) Tipo documental: debe existir en el registro de la fábrica.
    if (!FabricaFacturas.soporta(datos.tipo)) {
      errores.push(
        `El tipo "${datos.tipo}" no está soportado. Tipos válidos: ${FabricaFacturas.tipos().join(', ')}.`,
      );
    }

    // 4) Fecha: obligatoria, válida y no futura.
    const fecha = new Date(datos.fecha);
    if (!datos.fecha || Number.isNaN(fecha.getTime())) {
      errores.push('La fecha de la factura es obligatoria y debe ser válida.');
    } else if (fecha.getTime() > Date.now()) {
      advertencias.push(
        `La fecha ${String(datos.fecha).slice(0, 10)} es futura: requiere validación de gerencia.`,
      );
    }

    // 5) Detalle: al menos una línea y cada línea con cantidad/precio > 0.
    const lineas = Array.isArray(datos.lineas) ? datos.lineas : [];
    if (lineas.length === 0) {
      errores.push('La factura debe tener al menos una línea de detalle.');
    }
    lineas.forEach((linea, indice) => {
      const numeroLinea = indice + 1;
      const descripcion = String(linea?.descripcion ?? '').trim();
      const cantidad = Number(linea?.cantidad);
      const precio = Number(linea?.precioUnitario);

      if (descripcion === '') {
        errores.push(`Línea ${numeroLinea}: la descripción es obligatoria.`);
      }
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        errores.push(`Línea ${numeroLinea}: la cantidad debe ser mayor que 0.`);
      }
      if (!Number.isFinite(precio) || precio <= 0) {
        errores.push(`Línea ${numeroLinea}: el precio unitario debe ser mayor que 0.`);
      }
    });

    return {
      valida: errores.length === 0,
      errores,
      advertencias,
    };
  }
}
