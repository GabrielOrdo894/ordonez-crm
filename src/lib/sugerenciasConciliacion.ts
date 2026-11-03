// Sugerencias de conciliación bancaria (2026-11-03, petición de Gabriel). Lógica pura, sin base de
// datos: recibe el movimiento y los candidatos ya cargados y devuelve qué proponer. Mismos criterios
// que usan Pennylane/Qonto/Odoo para un volumen pequeño: importe exacto al céntimo, fecha cercana,
// número de factura en el concepto, combinación de varios cobros o gastos que suman justo el
// movimiento, y reglas por comercio aprendidas al conciliar a mano. Nunca se concilia nada solo
// desde aquí: quien llama decide si la sugerencia es lo bastante segura para aplicarla sin preguntar.
import { diasEntreIso } from './fechas';

export type ReglaBanco = {
  id: string;
  patron: string;
  sentido: 'pago' | 'cobro';
  accion: 'gasto' | 'operacion' | 'ignorar';
  proveedor_id: string | null;
  cuenta_contable: string | null;
  tipo_iva: string | null;
  descripcion: string | null;
  contrapartida: string | null;
  veces_aplicada: number;
};

/** Cobro ya registrado en una factura que todavía no está enlazado a ningún movimiento. */
export type PagoLibre = {
  id: string;
  factura_id: string;
  fecha: string;
  monto: number;
  numero: string | null;
  cliente_nombre: string | null;
};

/** Gasto (pagado o pendiente) que todavía no está enlazado a ningún movimiento. */
export type GastoLibre = {
  id: string;
  fecha: string;
  total: number;
  proveedor: string | null;
  proveedor_id: string | null;
  descripcion: string | null;
};

export type FacturaPendiente = {
  id: string;
  numero: string | null;
  cliente_nombre: string | null;
  pendiente: number;
};

export type MovimientoParaSugerir = { fecha: string; importe: number; descripcion: string | null };

export type Sugerencia =
  | { tipo: 'pagos'; pagos: PagoLibre[]; exacta: boolean; motivo: string }
  | { tipo: 'factura'; factura: FacturaPendiente; exacta: boolean; motivo: string }
  | { tipo: 'gastos'; gastos: GastoLibre[]; exacta: boolean; motivo: string }
  | { tipo: 'regla'; regla: ReglaBanco; exacta: boolean; motivo: string };

const cent = (n: number) => Math.round(n * 100);

export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/�/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre del comercio o de la contraparte sacado del concepto del banco: quita el prefijo de
 * tarjeta ("X7868"), de transferencia ("VIR INST vers", "WEB", "B2B") y la fecha del final. Es lo
 * que se propone como patrón al crear una regla. */
export function comercioDeMovimiento(descripcion: string | null | undefined): string {
  let s = (descripcion ?? '').split(' — ')[0].replace(/�/g, '').trim();
  s = s.replace(/^X\d{4}\s+/i, '');
  s = s.replace(
    /^(VIR(EMENT)?\s+INST\s+(vers|de)\s+|VIR\s+(vers|de)\s+|WEB\s+|B2B\s+|PRLV\s+)/i,
    '',
  );
  s = s.replace(/\s+\d{2}\/\d{2}(\s+\d{2}H\d{2})?\s*$/i, '');
  s = s.replace(/\s+Virt en fav.*$/i, '');
  return s.replace(/\s+/g, ' ').trim();
}

export function sentidoDe(importe: number): 'pago' | 'cobro' {
  return importe < 0 ? 'pago' : 'cobro';
}

/** Regla que aplica a un movimiento: la de patrón más largo entre las de su mismo sentido. */
export function reglaQueAplica(m: MovimientoParaSugerir, reglas: ReglaBanco[]): ReglaBanco | null {
  const texto = normalizarTexto(m.descripcion);
  const sentido = sentidoDe(m.importe);
  const candidatas = reglas.filter(
    (r) => r.sentido === sentido && texto.includes(normalizarTexto(r.patron)),
  );
  if (candidatas.length === 0) return null;
  return candidatas.sort((a, b) => b.patron.length - a.patron.length)[0];
}

/** Números de factura del CRM que aparecen en el concepto ("F-2026-0006", "AC 2026 0011"...). */
export function numerosFacturaEnTexto(texto: string | null | undefined): string[] {
  const encontrados = (texto ?? '')
    .toUpperCase()
    .matchAll(/\b(ACE|AC|FE|F|RE|R)[\s-]?(20\d{2})[\s-]?(\d{4})\b/g);
  return Array.from(new Set(Array.from(encontrados, (m) => `${m[1]}-${m[2]}-${m[3]}`)));
}

/** Primera combinación (la de menos elementos) cuya suma es exactamente `objetivo`. Para ~40
 * movimientos al mes y pocas decenas de candidatos, una búsqueda exhaustiva acotada basta. */
export function combinacionExacta<T>(
  items: T[],
  objetivo: number,
  valor: (t: T) => number,
  maxElementos = 6,
): T[] | null {
  const meta = cent(objetivo);
  const valores = items.map((t) => cent(valor(t)));
  const n = Math.min(items.length, 18);
  for (let tam = 2; tam <= Math.min(maxElementos, n); tam++) {
    const elegidos: number[] = [];
    const buscar = (desde: number, suma: number): boolean => {
      if (elegidos.length === tam) return suma === meta;
      for (let i = desde; i < n; i++) {
        if (suma + valores[i] > meta) continue;
        elegidos.push(i);
        if (buscar(i + 1, suma + valores[i])) return true;
        elegidos.pop();
      }
      return false;
    };
    if (buscar(0, 0)) return elegidos.map((i) => items[i]);
  }
  return null;
}

const VENTANA_COBRO_DIAS = 10;

/** Sugerencias para un ingreso, de más a menos segura. */
export function sugerirParaCobro(
  m: MovimientoParaSugerir,
  pagosLibres: PagoLibre[],
  facturasPendientes: FacturaPendiente[],
  reglas: ReglaBanco[] = [],
): Sugerencia[] {
  if (m.importe <= 0) return [];
  const sugerencias: Sugerencia[] = [];
  const importe = cent(m.importe);
  const cerca = pagosLibres
    .filter((p) => Math.abs(diasEntreIso(m.fecha, p.fecha)) <= VENTANA_COBRO_DIAS)
    .sort(
      (a, b) => Math.abs(diasEntreIso(m.fecha, a.fecha)) - Math.abs(diasEntreIso(m.fecha, b.fecha)),
    );

  // 1. El concepto cita el número de la factura.
  for (const numero of numerosFacturaEnTexto(m.descripcion)) {
    const pago = pagosLibres.find((p) => p.numero === numero && cent(p.monto) === importe);
    if (pago) {
      sugerencias.push({
        tipo: 'pagos',
        pagos: [pago],
        exacta: true,
        motivo: `El concepto cita ${numero} y su cobro ya registrado es del mismo importe`,
      });
      continue;
    }
    const factura = facturasPendientes.find((f) => f.numero === numero);
    if (factura) {
      const exacta = cent(factura.pendiente) === importe;
      sugerencias.push({
        tipo: 'factura',
        factura,
        exacta,
        motivo: exacta
          ? `El concepto cita ${numero} y su pendiente coincide`
          : `El concepto cita ${numero} (cobro parcial)`,
      });
    }
  }

  // 2. Un cobro ya registrado a mano del mismo importe y fecha cercana.
  const mismos = cerca.filter((p) => cent(p.monto) === importe);
  if (mismos.length > 0) {
    sugerencias.push({
      tipo: 'pagos',
      pagos: [mismos[0]],
      exacta: mismos.length === 1,
      motivo: `Cobro de ${mismos[0].numero ?? 'factura'} ya registrado el ${mismos[0].fecha}${mismos.length > 1 ? ` (hay ${mismos.length} iguales)` : ''}`,
    });
  }

  // 3. Varios cobros ya registrados que suman justo el ingreso (una transferencia, varias facturas).
  //    Primero los del mismo día, que es lo habitual al registrar a mano.
  const porDia = new Map<string, PagoLibre[]>();
  for (const p of cerca) porDia.set(p.fecha, [...(porDia.get(p.fecha) ?? []), p]);
  let combinacion: PagoLibre[] | null = null;
  for (const grupo of porDia.values()) {
    combinacion = combinacionExacta(grupo, m.importe, (p) => p.monto);
    if (combinacion) break;
  }
  combinacion ??= combinacionExacta(cerca, m.importe, (p) => p.monto, 4);
  if (combinacion) {
    sugerencias.push({
      tipo: 'pagos',
      pagos: combinacion,
      exacta: combinacion.every((p) => p.fecha === combinacion![0].fecha),
      motivo: `${combinacion.map((p) => p.numero).join(' + ')} suman exactamente el ingreso`,
    });
  }

  // 4. Una factura pendiente con ese importe exacto.
  const facturas = facturasPendientes.filter((f) => cent(f.pendiente) === importe);
  if (facturas.length > 0) {
    sugerencias.push({
      tipo: 'factura',
      factura: facturas[0],
      exacta: facturas.length === 1,
      motivo: `Pendiente de ${facturas[0].numero} coincide${facturas.length > 1 ? ` (hay ${facturas.length} iguales)` : ''}`,
    });
  }

  const regla = reglaQueAplica(m, reglas);
  if (regla)
    sugerencias.push({ tipo: 'regla', regla, exacta: true, motivo: `Regla «${regla.patron}»` });
  return sinRepetidas(sugerencias);
}

/** Sugerencias para un pago, de más a menos segura. Ventana de fechas igual que banco-sync: el
 * gasto entre 10 días antes y 3 después del cargo (el ticket es del día, el cargo llega después). */
export function sugerirParaPago(
  m: MovimientoParaSugerir,
  gastosLibres: GastoLibre[],
  reglas: ReglaBanco[] = [],
): Sugerencia[] {
  if (m.importe >= 0) return [];
  const sugerencias: Sugerencia[] = [];
  const total = Math.abs(m.importe);
  const dentro = (g: GastoLibre, antes: number) => {
    const d = diasEntreIso(m.fecha, g.fecha);
    return d >= -antes && d <= 3;
  };
  const cercanos = gastosLibres
    .filter((g) => dentro(g, 10))
    .sort(
      (a, b) => Math.abs(diasEntreIso(m.fecha, a.fecha)) - Math.abs(diasEntreIso(m.fecha, b.fecha)),
    );
  const mismos = cercanos.filter((g) => cent(g.total) === cent(total));
  if (mismos.length > 0) {
    sugerencias.push({
      tipo: 'gastos',
      gastos: [mismos[0]],
      exacta: mismos.length === 1,
      motivo: `Gasto de ${mismos[0].proveedor ?? 'proveedor'} del ${mismos[0].fecha} con el mismo importe${mismos.length > 1 ? ` (hay ${mismos.length} iguales)` : ''}`,
    });
  }

  const regla = reglaQueAplica(m, reglas);
  // Una transferencia a un proveedor suele saldar varias facturas suyas de las últimas semanas: si
  // una regla dice quién es el proveedor, se buscan combinaciones de sus gastos de 60 días.
  if (regla?.proveedor_id) {
    const delProveedor = gastosLibres
      .filter((g) => g.proveedor_id === regla.proveedor_id && dentro(g, 60))
      .sort(
        (a, b) =>
          Math.abs(diasEntreIso(m.fecha, a.fecha)) - Math.abs(diasEntreIso(m.fecha, b.fecha)),
      );
    const combinacion = combinacionExacta(delProveedor, total, (g) => g.total, 8);
    if (combinacion) {
      sugerencias.push({
        tipo: 'gastos',
        gastos: combinacion,
        exacta: false,
        motivo: `${combinacion.length} gastos de ${combinacion[0].proveedor ?? 'este proveedor'} suman exactamente el pago`,
      });
    }
  }
  if (regla)
    sugerencias.push({ tipo: 'regla', regla, exacta: true, motivo: `Regla «${regla.patron}»` });
  return sinRepetidas(sugerencias);
}

function claveSugerencia(s: Sugerencia): string {
  if (s.tipo === 'pagos')
    return `p:${s.pagos
      .map((p) => p.id)
      .sort()
      .join(',')}`;
  if (s.tipo === 'gastos')
    return `g:${s.gastos
      .map((g) => g.id)
      .sort()
      .join(',')}`;
  if (s.tipo === 'factura') return `f:${s.factura.id}`;
  return `r:${s.regla.id}`;
}

function sinRepetidas(lista: Sugerencia[]): Sugerencia[] {
  const vistas = new Set<string>();
  return lista.filter((s) => {
    const k = claveSugerencia(s);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/** Si un movimiento se puede conciliar sin preguntar: una única sugerencia exacta que enlaza
 * documentos que ya existen (nunca crea un cobro nuevo ni aplica una regla sin que se vea). */
export function sugerenciaAutomatica(sugerencias: Sugerencia[]): Sugerencia | null {
  const exactas = sugerencias.filter(
    (s) => s.exacta && (s.tipo === 'pagos' || s.tipo === 'gastos'),
  );
  return exactas.length === 1 && sugerencias.filter((s) => s.tipo !== 'regla').length === 1
    ? exactas[0]
    : null;
}
