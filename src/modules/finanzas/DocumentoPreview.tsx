import { hexARgb, DECENNALE_BULLETS_FR, type EntidadPais } from '../../lib/pdfEmpresa';
import { totalLineaMax, formatearUnidadTexto, formatearPrecio, formatearRangoPrecio } from './lineas';
import type { Linea } from './lineas';
import { parsearTextoEnriquecido } from '../../lib/textoEnriquecido';
import { direccionEnDosLineas } from '../../lib/direcciones';

function lineasDireccion(direccion: string | null | undefined): string[] {
  const lineas = direccionEnDosLineas(direccion).filter(Boolean);
  return lineas.length > 0 ? lineas : ['—'];
}

type CampoDocumento = { label: string; valor: string; claseColor?: string };
type PlazoPreview = { concepto: string; porcentaje: number; importe: number };

export type PlantillaDocumento = 'clasica' | 'moderna' | 'elegante' | 'francesa' | 'minimalista' | 'ejecutiva' | 'creativa';

export const PLANTILLAS_DOCUMENTO: { value: PlantillaDocumento; label: string; descripcion: string }[] = [
  { value: 'clasica', label: 'Clásica', descripcion: 'Cabecera verde sólida, tarjetas de datos y tabla con encabezado de color.' },
  { value: 'moderna', label: 'Moderna', descripcion: 'Cabecera blanca minimalista, línea de acento y tabla sin relleno de color.' },
  { value: 'elegante', label: 'Elegante', descripcion: 'Cabecera centrada con doble línea, acabado suave en verde claro.' },
  {
    value: 'francesa',
    label: 'Francesa (Devis)',
    descripcion: 'Cabecera blanca sin bloque de color, título grande a la derecha y datos de cliente sin tarjetas, al estilo devis francés.',
  },
  {
    value: 'minimalista',
    label: 'Minimalista',
    descripcion: 'Solo una línea fina de separación, sin fondos de color — la opción más sobria y discreta.',
  },
  {
    value: 'ejecutiva',
    label: 'Ejecutiva',
    descripcion: 'Cabecera alta a doble tono con banda de acento, para un tono más corporativo y contundente.',
  },
  {
    value: 'creativa',
    label: 'Creativa',
    descripcion: 'Barra lateral de color con acento, logo destacado y título con línea decorativa — el toque más distintivo.',
  },
];

export type AlineacionEncabezado = 'auto' | 'izquierda' | 'centro' | 'derecha';

export type ConfigTabla = {
  lineas: boolean;
  lineasVerticales: boolean;
  filasIntercaladas: boolean;
  encabezadoColoreado: boolean;
  // 'auto' mantiene la alineación actual por columna (texto a la izquierda, números a la
  // derecha). Las otras tres fuerzan la misma alineación en todos los encabezados.
  alineacionEncabezado: AlineacionEncabezado;
};

export type ConfigColumnas = {
  referencia: boolean;
  descripcion: boolean;
  unidad: boolean;
};

export type TamanoTitulo = 'sm' | 'md' | 'lg';

export type ConfigPlantilla = {
  estructura: PlantillaDocumento;
  colorPrimario: string;
  colorSecundario: string;
  mostrarLogo: boolean;
  piePagina: string;
  tabla: ConfigTabla;
  columnas: ConfigColumnas;
  empresaClienteIzquierda: boolean;
  planPagoIzquierda: boolean;
  tamanoTituloDocumento: TamanoTitulo;
  tamanoTituloReforma: TamanoTitulo;
  portadaTaglineEs: string;
  portadaTaglineFr: string;
};

const TAMANOS_VALIDOS: TamanoTitulo[] = ['sm', 'md', 'lg'];

export const PORTADA_TAGLINE_ES_DEFECTO = 'Calidad, compromiso y confianza en cada detalle.';
export const PORTADA_TAGLINE_FR_DEFECTO = 'Qualité, engagement et confiance à chaque détail.';

export const CONFIG_PLANTILLA_DEFECTO: ConfigPlantilla = {
  estructura: 'minimalista',
  colorPrimario: '#1a5c38',
  colorSecundario: '#c0392b',
  mostrarLogo: true,
  piePagina: '',
  tabla: { lineas: true, lineasVerticales: false, filasIntercaladas: true, encabezadoColoreado: true, alineacionEncabezado: 'auto' },
  columnas: { referencia: true, descripcion: true, unidad: true },
  empresaClienteIzquierda: true,
  planPagoIzquierda: true,
  tamanoTituloDocumento: 'md',
  tamanoTituloReforma: 'md',
  portadaTaglineEs: PORTADA_TAGLINE_ES_DEFECTO,
  portadaTaglineFr: PORTADA_TAGLINE_FR_DEFECTO,
};

function tamanoValido(v: unknown): TamanoTitulo {
  return TAMANOS_VALIDOS.includes(v as TamanoTitulo) ? (v as TamanoTitulo) : 'md';
}

const ALINEACIONES_VALIDAS: AlineacionEncabezado[] = ['auto', 'izquierda', 'centro', 'derecha'];

function alineacionValida(v: unknown): AlineacionEncabezado {
  return ALINEACIONES_VALIDAS.includes(v as AlineacionEncabezado) ? (v as AlineacionEncabezado) : 'auto';
}

export function configPlantillaDesde(valor: unknown): ConfigPlantilla {
  if (!valor || typeof valor !== 'object') {
    return CONFIG_PLANTILLA_DEFECTO;
  }
  const v = valor as Partial<ConfigPlantilla>;
  return {
    // Estructura fijada a "minimalista" — el resto de estilos ya no se ofrecen en el constructor.
    estructura: 'minimalista',
    colorPrimario: v.colorPrimario || CONFIG_PLANTILLA_DEFECTO.colorPrimario,
    colorSecundario: v.colorSecundario || CONFIG_PLANTILLA_DEFECTO.colorSecundario,
    mostrarLogo: v.mostrarLogo ?? CONFIG_PLANTILLA_DEFECTO.mostrarLogo,
    piePagina: v.piePagina ?? '',
    tabla: {
      ...CONFIG_PLANTILLA_DEFECTO.tabla,
      ...(v.tabla ?? {}),
      alineacionEncabezado: alineacionValida(v.tabla?.alineacionEncabezado),
    },
    columnas: { ...CONFIG_PLANTILLA_DEFECTO.columnas, ...(v.columnas ?? {}) },
    empresaClienteIzquierda: v.empresaClienteIzquierda ?? CONFIG_PLANTILLA_DEFECTO.empresaClienteIzquierda,
    planPagoIzquierda: v.planPagoIzquierda ?? CONFIG_PLANTILLA_DEFECTO.planPagoIzquierda,
    tamanoTituloDocumento: tamanoValido(v.tamanoTituloDocumento),
    tamanoTituloReforma: tamanoValido(v.tamanoTituloReforma),
    portadaTaglineEs: v.portadaTaglineEs || PORTADA_TAGLINE_ES_DEFECTO,
    portadaTaglineFr: v.portadaTaglineFr || PORTADA_TAGLINE_FR_DEFECTO,
  };
}

export function tonoOscuro(hex: string, factor = 0.55): string {
  const [r, g, b] = hexARgb(hex);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

export function tonoClaro(hex: string, mezcla = 0.88): string {
  const [r, g, b] = hexARgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * mezcla);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

const LABELS_EXTRA = {
  es: {
    referencia: 'Ref.',
    descripcion: 'Descripción',
    unidad: 'Ud.',
    emisor: 'Emisor',
    formaPago: 'Forma de pago',
    titular: 'Titular',
    banco: 'Banco',
    condicionesPago: 'Condiciones de pago',
    delaiPago: 'Plazo de pago',
    penalizacionRetraso: 'Penalización por retraso',
    medioPago: 'Medio de pago',
    devisAsociado: 'Presupuesto asociado',
    acomptesVersados: 'Anticipos cobrados',
    restePagarHt: 'Resto a pagar (base)',
    restePagarTtc: 'Resto a pagar',
    dont: 'De los cuales',
  },
  fr: {
    referencia: 'Réf.',
    descripcion: 'Description',
    unidad: 'Unit',
    emisor: 'Émetteur',
    formaPago: 'Modalités de paiement',
    titular: 'Titulaire',
    banco: 'Banque',
    condicionesPago: 'Conditions de paiement',
    delaiPago: 'Délai de paiement',
    penalizacionRetraso: 'Pénalité de retard',
    medioPago: 'Moyens de paiement',
    devisAsociado: 'Devis associé',
    acomptesVersados: 'Acomptes versés',
    restePagarHt: 'Reste à payer HT',
    restePagarTtc: 'Reste à payer TTC',
    dont: 'Dont',
  },
};

type DocumentoPreviewProps = {
  plantilla?: PlantillaDocumento;
  colorPrimario?: string;
  colorSecundario?: string;
  mostrarLogo?: boolean;
  empresaAbajo?: boolean;
  empresaArriba?: boolean;
  columnasInvertidas?: boolean;
  empresaClienteIzquierda?: boolean;
  tamanoTituloDocumento?: TamanoTitulo;
  tamanoTituloReforma?: TamanoTitulo;
  tabla?: ConfigTabla;
  columnasExtra?: ConfigColumnas;
  piePagina?: string;
  idioma?: 'es' | 'fr';
  tituloDocumento: string;
  titulo?: string;
  numero: string | null;
  entidad: EntidadPais;
  logoUrl?: string;
  pais: string;
  clienteNombre: string;
  clienteDir: string;
  clienteDirExtra?: string;
  clienteContacto: string;
  labelCif: string;
  camposDocumento: CampoDocumento[];
  columnasTabla: string[];
  lineas: Linea[];
  totalSinIva: number;
  totalConIva: number;
  totalSinIvaMax?: number;
  totalConIvaMax?: number;
  porcentajeIva: number;
  labelBase: string;
  labelIva: string;
  mencionIva?: string | null;
  notaOrientativo?: string;
  planPago?: PlazoPreview[];
  labelPlanPago?: string;
  condicionesPago?: { delai?: string; penalizacion?: string; medio?: string };
  acomptes?: { itemizado: { numero: string; total: number }[] } | null;
  notasLegales?: string[];
  firmaBase64?: string | null;
  firmaNombre?: string | null;
  firmaFecha?: string | null;
  labelFirma?: string;
  labelPendienteFirma?: string;
  mensajeGracias?: string;
  tc?: string;
  labelTyc?: string;
  nota?: string;
  labelNota?: string;
};

export function DocumentoPreview({
  plantilla = 'clasica',
  colorPrimario = CONFIG_PLANTILLA_DEFECTO.colorPrimario,
  colorSecundario = CONFIG_PLANTILLA_DEFECTO.colorSecundario,
  mostrarLogo = true,
  empresaAbajo = false,
  empresaArriba = false,
  columnasInvertidas = false,
  empresaClienteIzquierda = true,
  tamanoTituloDocumento = 'md',
  tamanoTituloReforma = 'md',
  tabla = CONFIG_PLANTILLA_DEFECTO.tabla,
  columnasExtra = CONFIG_PLANTILLA_DEFECTO.columnas,
  piePagina,
  idioma = 'es',
  tituloDocumento,
  titulo,
  numero,
  entidad,
  logoUrl,
  pais,
  clienteNombre,
  clienteDir,
  clienteDirExtra,
  clienteContacto,
  labelCif,
  camposDocumento,
  columnasTabla,
  lineas,
  totalSinIva,
  totalConIva,
  totalSinIvaMax,
  totalConIvaMax,
  porcentajeIva,
  labelBase,
  labelIva,
  mencionIva,
  notaOrientativo,
  planPago,
  labelPlanPago,
  condicionesPago,
  acomptes,
  notasLegales,
  firmaBase64,
  firmaNombre,
  firmaFecha,
  labelFirma,
  labelPendienteFirma,
  mensajeGracias,
  tc,
  labelTyc,
  nota,
  labelNota,
}: DocumentoPreviewProps) {
  const colorOscuro = tonoOscuro(colorPrimario);
  const colorClaro = tonoClaro(colorPrimario);
  const labelsExtra = LABELS_EXTRA[idioma];
  const logoVisible = mostrarLogo && !!logoUrl;

  const lineaFiscal = [
    entidad.identificador && `${labelCif}: ${entidad.identificador}`,
    entidad.identificador_extra && (pais === 'Francia' ? `TVA: ${entidad.identificador_extra}` : entidad.identificador_extra),
  ]
    .filter(Boolean)
    .join(' · ');

  const TAMANO_TITULO_DOC: Record<TamanoTitulo, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-lg' };
  const TAMANO_TITULO_REFORMA: Record<TamanoTitulo, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };

  const cardEstilo = { backgroundColor: colorClaro, borderColor: colorClaro };
  const cardLabelEstilo = { color: colorOscuro };
  const theadEstilo = tabla.encabezadoColoreado
    ? { backgroundColor: colorPrimario, color: '#fff' }
    : { backgroundColor: '#fff', color: '#6b7280', borderBottom: '2px solid #111827' };

  const ALINEACION_CLASE: Record<Exclude<AlineacionEncabezado, 'auto'>, string> = {
    izquierda: 'text-left',
    centro: 'text-center',
    derecha: 'text-right',
  };
  // 'auto' conserva la alineación por columna de siempre (texto a la izquierda, números a la
  // derecha); el resto de valores fuerzan la misma alineación en todos los encabezados.
  const claseEncabezado = (porDefecto: 'text-left' | 'text-right') =>
    tabla.alineacionEncabezado === 'auto' ? porDefecto : ALINEACION_CLASE[tabla.alineacionEncabezado];

  const bloqueDatosDocumento = (alineacion: 'left' | 'right') => (
    <div className={alineacion === 'right' ? 'text-right' : 'text-left'}>
      <p className="font-semibold uppercase text-[9px] mb-0.5 text-gray-400">{tituloDocumento}</p>
      {camposDocumento.map((c) => (
        <p key={c.label} className={`text-[10px] ${c.claseColor ?? 'text-gray-500'}`}>
          {c.label}: <span className={c.claseColor ? 'font-semibold' : ''}>{c.valor}</span>
        </p>
      ))}
    </div>
  );

  return (
    <div
      className={`documento-papel bg-surface overflow-hidden text-[11px] leading-snug relative ${
        plantilla === 'elegante' ? 'border-2 rounded' : 'border rounded-sm'
      }`}
      style={{
        borderColor: plantilla === 'elegante' ? colorClaro : '#e5e7eb',
        borderLeft: plantilla === 'creativa' ? `6px solid ${colorPrimario}` : undefined,
        boxShadow: plantilla === 'creativa' ? `3px 0 0 0 ${colorSecundario} inset` : undefined,
      }}
    >
      {plantilla === 'elegante' && (
        <div
          className="px-4 pt-5 pb-4 flex flex-col items-center text-center border-b-4 border-double"
          style={{ borderColor: colorPrimario }}
        >
          {logoVisible && <img src={logoUrl} alt="" className="w-12 h-12 object-contain mb-2" />}
          {!empresaAbajo && <p className="font-bold text-gray-900">{entidad.razon_social || 'Reformas Ordoñez'}</p>}
          {!empresaAbajo && !empresaArriba && (
            <>
              <p className="text-gray-500 text-[9px]">
                {[entidad.direccion, entidad.telefono, entidad.web].filter(Boolean).join(' · ')}
              </p>
              {lineaFiscal && <p className="text-gray-500 text-[9px]">{lineaFiscal}</p>}
            </>
          )}
          <p className="font-bold text-sm tracking-[0.2em] uppercase mt-2" style={{ color: colorPrimario }}>
            {tituloDocumento}
          </p>
          {empresaArriba && titulo ? (
            <p className="text-gray-500 text-[9px] mt-0.5">{titulo}</p>
          ) : (
            <>
              {empresaAbajo && titulo && <p className="text-gray-500 text-[9px] mt-0.5">{titulo}</p>}
              <p className="text-gray-400 text-[9px]">Nº: {numero ?? '—'}</p>
            </>
          )}
        </div>
      )}

      {(plantilla === 'clasica' || plantilla === 'moderna') && (
        <div
          className={`px-4 py-3 flex items-start justify-between ${plantilla === 'moderna' ? 'border-b-2' : 'text-white'}`}
          style={
            plantilla === 'moderna'
              ? { backgroundColor: '#fff', color: '#111827', borderColor: colorPrimario }
              : { backgroundColor: colorOscuro }
          }
        >
          <div className="flex items-center gap-2 min-w-0">
            {logoVisible && <img src={logoUrl} alt="" className="w-10 h-10 object-contain shrink-0" />}
            {!empresaAbajo && (
              <div className="min-w-0">
                <p className="font-bold truncate">{entidad.razon_social || 'Reformas Ordoñez'}</p>
                {!empresaArriba && (
                  <>
                    <p className={`text-[9px] truncate ${plantilla === 'moderna' ? 'text-gray-500' : 'text-white/70'}`}>
                      {[entidad.direccion, entidad.telefono, entidad.web].filter(Boolean).join(' · ')}
                    </p>
                    {lineaFiscal && (
                      <p className={`text-[9px] truncate ${plantilla === 'moderna' ? 'text-gray-500' : 'text-white/70'}`}>
                        {lineaFiscal}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-xl" style={plantilla === 'moderna' ? { color: colorPrimario } : undefined}>
              {tituloDocumento}
            </p>
            {empresaArriba && titulo ? (
              <p className={`text-[9px] ${plantilla === 'moderna' ? 'text-gray-500' : 'text-white/80'}`}>{titulo}</p>
            ) : (
              <>
                {empresaAbajo && titulo && (
                  <p className={`text-[9px] ${plantilla === 'moderna' ? 'text-gray-500' : 'text-white/80'}`}>{titulo}</p>
                )}
                <p className={`text-[9px] ${plantilla === 'moderna' ? 'text-gray-400' : 'text-white/80'}`}>Nº: {numero ?? '—'}</p>
              </>
            )}
          </div>
        </div>
      )}

      {plantilla === 'francesa' && (
        <div className="px-4 py-3 flex items-start justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {logoVisible && <img src={logoUrl} alt="" className="w-9 h-9 object-contain shrink-0" />}
            {!empresaAbajo && (
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{entidad.razon_social || 'Reformas Ordoñez'}</p>
                {!empresaArriba && (
                  <>
                    <p className="text-[9px] text-gray-400 truncate">
                      {[entidad.direccion, entidad.telefono, entidad.web].filter(Boolean).join(' · ')}
                    </p>
                    {lineaFiscal && <p className="text-[9px] text-gray-400 truncate">{lineaFiscal}</p>}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-2xl" style={{ color: colorPrimario }}>
              {tituloDocumento}
            </p>
            {empresaArriba && titulo ? (
              <p className="text-[9px] text-gray-500">{titulo}</p>
            ) : (
              <>
                {empresaAbajo && titulo && <p className="text-[9px] text-gray-500">{titulo}</p>}
                <p className="text-[9px] text-gray-400">Nº: {numero ?? '—'}</p>
              </>
            )}
          </div>
        </div>
      )}

      {plantilla === 'minimalista' && (
        <div className="px-4 pt-3 pb-2.5 flex items-center justify-between border-b" style={{ borderColor: '#e5e7eb' }}>
          <div className="flex items-center gap-2 min-w-0">
            {logoVisible && <img src={logoUrl} alt="" className="w-6 h-6 object-contain shrink-0" />}
            {!empresaAbajo && (
              <p className="font-semibold uppercase tracking-wide text-[10px] text-gray-700 truncate">
                {entidad.razon_social || 'Reformas Ordoñez'}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className={`font-semibold ${TAMANO_TITULO_DOC[tamanoTituloDocumento]}`} style={{ color: colorPrimario }}>
              {tituloDocumento}
            </p>
            {empresaArriba && titulo ? (
              <p className="text-[9px] text-gray-500">{titulo}</p>
            ) : (
              <>
                {empresaAbajo && titulo && <p className="text-[9px] text-gray-500">{titulo}</p>}
                <p className="text-[9px] text-gray-400">Nº: {numero ?? '—'}</p>
              </>
            )}
          </div>
        </div>
      )}

      {plantilla === 'ejecutiva' && (
        <div>
          <div className="px-4 py-3.5 flex items-start justify-between text-white" style={{ backgroundColor: colorOscuro }}>
            <div className="flex items-center gap-2 min-w-0">
              {logoVisible && <img src={logoUrl} alt="" className="w-10 h-10 object-contain shrink-0" />}
              {!empresaAbajo && (
                <div className="min-w-0">
                  <p className="font-bold truncate">{entidad.razon_social || 'Reformas Ordoñez'}</p>
                  {!empresaArriba && (
                    <>
                      <p className="text-[9px] truncate text-white/70">
                        {[entidad.direccion, entidad.telefono, entidad.web].filter(Boolean).join(' · ')}
                      </p>
                      {lineaFiscal && <p className="text-[9px] truncate text-white/70">{lineaFiscal}</p>}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-xl uppercase tracking-wide">{tituloDocumento}</p>
              {empresaArriba && titulo ? (
                <p className="text-[9px] text-white/80">{titulo}</p>
              ) : (
                <>
                  {empresaAbajo && titulo && <p className="text-[9px] text-white/80">{titulo}</p>}
                  <p className="text-[9px] text-white/80">Nº: {numero ?? '—'}</p>
                </>
              )}
            </div>
          </div>
          <div className="h-[3px]" style={{ backgroundColor: colorSecundario }} />
        </div>
      )}

      {plantilla === 'creativa' && (
        <div className="px-4 py-3 flex items-start justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {logoVisible && <img src={logoUrl} alt="" className="w-11 h-11 object-contain shrink-0" />}
            {!empresaAbajo && (
              <div className="min-w-0">
                <p className="font-bold text-gray-900 truncate">{entidad.razon_social || 'Reformas Ordoñez'}</p>
                {!empresaArriba && (
                  <>
                    <p className="text-[9px] text-gray-500 truncate">
                      {[entidad.direccion, entidad.telefono, entidad.web].filter(Boolean).join(' · ')}
                    </p>
                    {lineaFiscal && <p className="text-[9px] text-gray-500 truncate">{lineaFiscal}</p>}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-xl" style={{ color: colorPrimario }}>
              {tituloDocumento}
            </p>
            <div className="h-[2px] w-16 ml-auto my-0.5" style={{ backgroundColor: colorSecundario }} />
            {empresaArriba && titulo ? (
              <p className="text-[9px] text-gray-500">{titulo}</p>
            ) : (
              <>
                {empresaAbajo && titulo && <p className="text-[9px] text-gray-500">{titulo}</p>}
                <p className="text-[9px] text-gray-400">Nº: {numero ?? '—'}</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">
        {titulo && !empresaAbajo && !empresaArriba && (
          <p className={`font-semibold text-gray-900 ${TAMANO_TITULO_REFORMA[tamanoTituloReforma]}`}>{titulo}</p>
        )}

        {plantilla === 'minimalista' && (
          <div className="text-gray-500 text-[9px] text-left pb-2 flex flex-col gap-0.5">
            {camposDocumento.map((c) => (
              <p key={c.label} className={c.claseColor ?? ''}>
                {c.label}: <span className={c.claseColor ? 'font-semibold' : ''}>{c.valor}</span>
              </p>
            ))}
          </div>
        )}

        {empresaArriba && (
          <div className="text-gray-500 text-[9px] text-left pb-2 border-b border-gray-100 flex flex-col gap-0.5">
            {entidad.direccion && lineasDireccion(entidad.direccion).map((linea, i) => <p key={i}>{linea}</p>)}
            {entidad.telefono && <p>{entidad.telefono}</p>}
            {entidad.web && <p>{entidad.web}</p>}
            {entidad.identificador && (
              <p>
                {labelCif}: {entidad.identificador}
              </p>
            )}
            {entidad.identificador_extra && (
              <p>{pais === 'Francia' ? `TVA: ${entidad.identificador_extra}` : entidad.identificador_extra}</p>
            )}
          </div>
        )}
        {notaOrientativo && (
          <p className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-medium rounded-sm px-2.5 py-1.5">
            {notaOrientativo}
          </p>
        )}

        {plantilla === 'francesa' ? (
          <div className="flex justify-end">
            <div className="text-right max-w-[75%]">
              <p className="font-semibold uppercase text-[9px] mb-0.5 text-gray-400">Cliente</p>
              <p className="text-gray-900 font-medium">{clienteNombre || '—'}</p>
              {lineasDireccion(clienteDir).map((linea, i) => (
                <p key={i} className="text-gray-500 text-[10px]">{linea}</p>
              ))}
              {clienteDirExtra && <p className="text-gray-500 text-[10px]">{clienteDirExtra}</p>}
              <p className="text-gray-500 text-[10px] mb-2">{clienteContacto}</p>
              {bloqueDatosDocumento('right')}
            </div>
          </div>
        ) : plantilla === 'minimalista' ? (
          <div className="grid grid-cols-2 gap-3">
            {(() => {
              const cardCliente = (
                <div key="cliente" className="rounded-sm p-2.5 border" style={cardEstilo}>
                  <p className="font-semibold uppercase text-[9px] mb-1" style={cardLabelEstilo}>
                    Cliente
                  </p>
                  <p className="text-gray-900 font-medium">{clienteNombre || '—'}</p>
                  {lineasDireccion(clienteDir).map((linea, i) => (
                <p key={i} className="text-gray-500 text-[10px]">{linea}</p>
              ))}
                  {clienteDirExtra && <p className="text-gray-500 text-[10px]">{clienteDirExtra}</p>}
                  <p className="text-gray-500 text-[10px]">{clienteContacto}</p>
                </div>
              );
              const cardEmisor = (
                <div key="emisor" className="rounded-sm p-2.5 border" style={cardEstilo}>
                  <p className="font-semibold uppercase text-[9px] mb-1" style={cardLabelEstilo}>
                    {labelsExtra.emisor}
                  </p>
                  <p className="text-gray-900 font-medium">{entidad.razon_social || 'Reformas Ordoñez'}</p>
                  {entidad.direccion &&
                    lineasDireccion(entidad.direccion).map((linea, i) => (
                      <p key={i} className="text-gray-500 text-[10px]">{linea}</p>
                    ))}
                  {entidad.telefono && <p className="text-gray-500 text-[10px]">{entidad.telefono}</p>}
                  {lineaFiscal && <p className="text-gray-500 text-[10px]">{lineaFiscal}</p>}
                </div>
              );
              return empresaClienteIzquierda ? [cardEmisor, cardCliente] : [cardCliente, cardEmisor];
            })()}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-sm p-2.5 border" style={cardEstilo}>
              <p className="font-semibold uppercase text-[9px] mb-1" style={cardLabelEstilo}>
                Cliente
              </p>
              <p className="text-gray-900 font-medium">{clienteNombre || '—'}</p>
              {lineasDireccion(clienteDir).map((linea, i) => (
                <p key={i} className="text-gray-500 text-[10px]">{linea}</p>
              ))}
              {clienteDirExtra && <p className="text-gray-500 text-[10px]">{clienteDirExtra}</p>}
              <p className="text-gray-500 text-[10px]">{clienteContacto}</p>
            </div>
            <div className="rounded-sm p-2.5 border" style={cardEstilo}>
              <p className="font-semibold uppercase text-[9px] mb-1" style={cardLabelEstilo}>
                {tituloDocumento}
              </p>
              {camposDocumento.map((c) => (
                <p key={c.label} className={`text-[10px] ${c.claseColor ?? 'text-gray-700'}`}>
                  {c.label}: <span className={c.claseColor ? 'font-semibold' : ''}>{c.valor}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        <table
          className={`w-full table-fixed border-collapse text-[9.5px] ${
            tabla.lineasVerticales
              ? '[&_th]:border-r [&_th]:border-gray-200 [&_td]:border-r [&_td]:border-gray-100 [&_tr>:last-child]:border-r-0'
              : ''
          }`}
        >
          <thead>
            <tr style={theadEstilo}>
              <th className={`${claseEncabezado('text-right')} px-1.5 py-1 font-medium w-[6%]`}>{columnasTabla[0]}</th>
              <th className={`${claseEncabezado('text-left')} px-1.5 py-1 font-medium`}>{columnasTabla[1]}</th>
              {columnasExtra.unidad && (
                <th className={`${claseEncabezado('text-left')} px-1.5 py-1 font-medium w-[11%] whitespace-nowrap`}>
                  {labelsExtra.unidad}
                </th>
              )}
              <th className={`${claseEncabezado('text-right')} px-1.5 py-1 font-medium w-[9%]`}>{columnasTabla[2]}</th>
              <th className={`${claseEncabezado('text-right')} px-1.5 py-1 font-medium w-[17%]`}>{columnasTabla[3]}</th>
              <th className={`${claseEncabezado('text-right')} px-1.5 py-1 font-medium w-[14%]`}>{columnasTabla[4]}</th>
              <th className={`${claseEncabezado('text-right')} px-1.5 py-1 font-medium w-[14%]`}>{columnasTabla[5]}</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const rango = totalSinIvaMax != null;
              const max = totalLineaMax(l, porcentajeIva);
              const impar = i % 2 === 1;
              return (
                <tr
                  key={i}
                  className={tabla.lineas ? 'border-b border-gray-100' : ''}
                  style={tabla.filasIntercaladas && impar ? { backgroundColor: colorClaro } : undefined}
                >
                  <td className="px-1.5 py-1 text-right text-gray-400 align-top">{i + 1}</td>
                  <td className="px-1.5 py-1.5 align-top break-words">
                    {columnasExtra.referencia && l.referencia && (
                      <p className="text-[8px] uppercase tracking-wide text-gray-400 break-words">{l.referencia}</p>
                    )}
                    <p className="font-semibold text-gray-900 text-[10.5px] break-words">{formatearUnidadTexto(l.designacion) || '—'}</p>
                    {columnasExtra.descripcion && l.tipo_servicio && l.tipo_servicio !== '—' && (
                      <p className="italic text-gray-400 text-[9px] break-words">{l.tipo_servicio}</p>
                    )}
                    {columnasExtra.descripcion && l.descripcion && (
                      <div className="mt-0.5">
                        {parsearTextoEnriquecido(formatearUnidadTexto(l.descripcion)).map((bloque, idx) => (
                          <p
                            key={idx}
                            className={`text-gray-500 text-[9px] break-words ${bloque.negrita ? 'font-semibold' : 'font-normal'} ${bloque.cursiva ? 'italic' : ''}`}
                          >
                            {bloque.texto}
                          </p>
                        ))}
                      </div>
                    )}
                  </td>
                  {columnasExtra.unidad && <td className="px-1.5 py-1 text-gray-500 align-top">{l.unidad}</td>}
                  <td className="px-1.5 py-1 text-right text-gray-600 align-top">{l.cantidad}</td>
                  <td className="px-1.5 py-1 text-right text-gray-600 align-top">
                    {rango
                      ? formatearRangoPrecio(l.precio_unit, l.precio_unit_max ?? l.precio_unit)
                      : formatearPrecio(l.precio_unit)}
                  </td>
                  <td className="px-1.5 py-1 text-right text-gray-600 align-top">
                    {l.es_incluido
                      ? 'Incluido'
                      : rango
                        ? formatearRangoPrecio(l.total_sin_iva, max.sinIva)
                        : formatearPrecio(l.total_sin_iva)}
                  </td>
                  <td className="px-1.5 py-1 text-right text-gray-800 align-top">
                    {l.es_incluido
                      ? 'Incluido'
                      : rango
                        ? formatearRangoPrecio(l.total_con_iva, max.conIva)
                        : formatearPrecio(l.total_con_iva)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {(() => {
          // Si la factura ya incluye la línea de deducción de anticipos (lineaDeduccionAcomptes /
          // FacturaForm.tsx), `lineas` y por tanto totalConIva/totalSinIva YA son el resto a pagar
          // neto — no restar los acomptes otra vez, solo sumarlos de vuelta para el total original
          // como referencia. Fallback (resta) para facturas antiguas/manuales sin esa línea.
          const textoDeduccion = idioma === 'fr' ? 'Déduction acompte(s)' : 'Deducción de anticipo(s)';
          const tieneLineaDeduccion = lineas.some((l) => l.designacion === textoDeduccion);
          const tieneAcomptes = !!acomptes && acomptes.itemizado.length > 0;
          const acomptesTotalTtc = tieneAcomptes ? acomptes!.itemizado.reduce((s, a) => s + a.total, 0) : 0;
          const resteTtc = tieneLineaDeduccion ? totalConIva : totalConIva - acomptesTotalTtc;
          const totalOriginalTtc = tieneLineaDeduccion ? totalConIva + acomptesTotalTtc : totalConIva;
          const totalOriginalHt = porcentajeIva > 0 ? totalOriginalTtc / (1 + porcentajeIva / 100) : totalOriginalTtc;
          const resteHt = porcentajeIva > 0 ? resteTtc / (1 + porcentajeIva / 100) : resteTtc;
          const resteTva = resteTtc - resteHt;

          const columnaResumenFirma = (
            <div className="flex flex-col gap-3">
              <div className="rounded-sm p-3 border" style={cardEstilo}>
                {tieneAcomptes ? (
                  <>
                    <div className="flex justify-between text-gray-500 text-[10px]">
                      <span>{labelBase}</span>
                      <span>{formatearPrecio(totalOriginalHt)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-gray-700 text-[10px] mt-0.5">
                      <span>TOTAL</span>
                      <span>{formatearPrecio(totalOriginalTtc)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500 text-[10px] mt-1.5">
                      <span>{labelsExtra.acomptesVersados}</span>
                      <span>{formatearPrecio(acomptesTotalTtc)}</span>
                    </div>
                    {acomptes!.itemizado.map((a) => (
                      <div key={a.numero} className="flex justify-between text-gray-400 text-[9px] pl-2">
                        <span>{a.numero}</span>
                        <span>{formatearPrecio(a.total)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-gray-500 text-[10px] mt-1.5">
                      <span>{labelsExtra.restePagarHt}</span>
                      <span>{formatearPrecio(resteHt)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500 text-[10px]">
                      <span>{labelIva}</span>
                      <span>{formatearPrecio(resteTva)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400 text-[9px] pl-2">
                      <span>
                        {labelsExtra.dont} {porcentajeIva}%
                      </span>
                      <span>{formatearPrecio(resteTva)}</span>
                    </div>
                    <div
                      className="flex justify-between font-semibold border-t mt-1 pt-1"
                      style={{ color: colorPrimario, borderColor: '#e5e7eb' }}
                    >
                      <span>{labelsExtra.restePagarTtc}</span>
                      <span>{formatearPrecio(resteTtc)}</span>
                    </div>
                  </>
                ) : totalSinIvaMax != null && totalConIvaMax != null ? (
                  <>
                    <div className="flex justify-between text-gray-500 text-[10px]">
                      <span>{labelBase}</span>
                      <span>{formatearRangoPrecio(totalSinIva, totalSinIvaMax)}</span>
                    </div>
                    <div
                      className="flex justify-between font-semibold border-t mt-1 pt-1"
                      style={{ color: colorPrimario, borderColor: '#e5e7eb' }}
                    >
                      <span>TOTAL</span>
                      <span>{formatearRangoPrecio(totalSinIva, totalSinIvaMax)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-gray-500 text-[10px]">
                      <span>{labelBase}</span>
                      <span>{formatearPrecio(totalSinIva)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500 text-[10px]">
                      <span>
                        {labelIva} ({porcentajeIva}%)
                      </span>
                      <span>{formatearPrecio(totalConIva - totalSinIva)}</span>
                    </div>
                    <div
                      className="flex justify-between font-semibold border-t mt-1 pt-1"
                      style={{ color: colorPrimario, borderColor: '#e5e7eb' }}
                    >
                      <span>TOTAL</span>
                      <span>{formatearPrecio(totalConIva)}</span>
                    </div>
                  </>
                )}
              </div>

              {totalSinIvaMax != null && totalConIvaMax != null && (
                <p className="text-gray-400 text-[9px] text-right">
                  IVA no incluido — se determinará en el presupuesto definitivo tras la visita técnica.
                </p>
              )}
              {mencionIva && <p className="text-gray-400 text-[9px] text-right">{mencionIva}</p>}

              {labelFirma && (
                <div className="rounded-sm p-3 border" style={cardEstilo}>
                  <p className="font-semibold uppercase text-[9px] mb-1" style={cardLabelEstilo}>
                    {labelFirma}
                  </p>
                  {firmaBase64 ? (
                    <div>
                      <img src={firmaBase64} alt="Firma" className="h-10" />
                      <p className="text-gray-400 text-[9px] mt-1">
                        {firmaNombre} — {firmaFecha?.slice(0, 10)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-400 italic text-[9px]">{labelPendienteFirma}</p>
                  )}
                </div>
              )}
            </div>
          );

          const columnaPlanForma = (
            <div className="flex flex-col gap-3">
              {planPago && planPago.length > 0 && (
                <div>
                  <p className="font-semibold uppercase text-[9px] mb-1" style={cardLabelEstilo}>
                    {labelPlanPago}
                  </p>
                  <table className="w-full border-collapse text-[9.5px]">
                    <tbody>
                      {planPago.map((p, i) => (
                        <tr
                          key={i}
                          className={tabla.lineas ? 'border-b border-gray-100' : ''}
                          style={tabla.filasIntercaladas && i % 2 === 1 ? { backgroundColor: colorClaro } : undefined}
                        >
                          <td className="px-1.5 py-1 text-gray-800 align-middle">{p.concepto}</td>
                          <td className="px-1.5 py-1 text-right text-gray-600 align-middle whitespace-nowrap">{p.porcentaje}%</td>
                          <td className="px-1.5 py-1 text-right text-gray-800 align-middle whitespace-nowrap">{formatearPrecio(p.importe)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {condicionesPago && (condicionesPago.delai || condicionesPago.penalizacion || condicionesPago.medio) && (
                <div className="text-[9.5px] text-gray-700 px-0.5">
                  <p className="font-semibold uppercase text-[9px] mb-1.5" style={{ color: colorPrimario }}>
                    {labelsExtra.condicionesPago}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {condicionesPago.delai && (
                      <div>
                        <p className="font-semibold text-gray-800">{labelsExtra.delaiPago}</p>
                        <p className="text-gray-600">{condicionesPago.delai}</p>
                      </div>
                    )}
                    {condicionesPago.penalizacion && (
                      <div>
                        <p className="font-semibold text-gray-800">{labelsExtra.penalizacionRetraso}</p>
                        <p className="text-gray-600">{condicionesPago.penalizacion}</p>
                      </div>
                    )}
                    {condicionesPago.medio && (
                      <div>
                        <p className="font-semibold text-gray-800">{labelsExtra.medioPago}</p>
                        <p className="text-gray-600">{condicionesPago.medio}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {entidad.iban && (
                <div className="text-[9.5px] text-gray-700 px-0.5">
                  <p className="font-semibold uppercase text-[9px] mb-1.5" style={{ color: colorPrimario }}>
                    {labelsExtra.formaPago}
                  </p>
                  <div className="flex flex-col gap-1">
                    {entidad.nombre_titular && (
                      <p>
                        <span className="font-semibold" style={{ color: colorPrimario }}>
                          {labelsExtra.titular}:{' '}
                        </span>
                        {entidad.nombre_titular}
                      </p>
                    )}
                    <p>
                      <span className="font-semibold" style={{ color: colorPrimario }}>
                        IBAN:{' '}
                      </span>
                      {entidad.iban}
                    </p>
                    {entidad.bic && (
                      <p>
                        <span className="font-semibold" style={{ color: colorPrimario }}>
                          BIC:{' '}
                        </span>
                        {entidad.bic}
                      </p>
                    )}
                    {entidad.banco && (
                      <p>
                        <span className="font-semibold" style={{ color: colorPrimario }}>
                          {labelsExtra.banco}:{' '}
                        </span>
                        {entidad.banco}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );

          return (
            <div className="grid grid-cols-2 gap-5 items-start">
              {columnasInvertidas ? (
                <>
                  {columnaPlanForma}
                  {columnaResumenFirma}
                </>
              ) : (
                <>
                  {columnaResumenFirma}
                  {columnaPlanForma}
                </>
              )}
            </div>
          );
        })()}

        {entidad.seguro &&
          (() => {
            const esFrancia = pais === 'Francia';
            return (
              <div className="rounded-sm p-2.5 border text-[9.5px] text-gray-700" style={cardEstilo}>
                <p>
                  <span className="font-semibold" style={{ color: colorPrimario }}>
                    {esFrancia ? 'Garantie décennale' : 'Seguro'}:{' '}
                  </span>
                  {[
                    entidad.seguro,
                    entidad.num_attestation && (esFrancia ? `Police n° ${entidad.num_attestation}` : `Nº ${entidad.num_attestation}`),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {esFrancia && (
                  <ul className="mt-1 pl-3.5 list-disc text-gray-500">
                    {DECENNALE_BULLETS_FR.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}

        {nota && (
          <div className="text-[9.5px] text-gray-700">
            <p className="font-semibold uppercase text-[9px] mb-1" style={cardLabelEstilo}>
              {labelNota}
            </p>
            {parsearTextoEnriquecido(nota).map((bloque, idx) => (
              <p
                key={idx}
                className={`break-words ${bloque.negrita ? 'font-semibold' : 'font-normal'} ${bloque.cursiva ? 'italic' : ''}`}
              >
                {bloque.texto}
              </p>
            ))}
          </div>
        )}

        {notasLegales && notasLegales.length > 0 && (
          <div className="text-gray-400 italic text-[9px]">
            {notasLegales.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </div>
        )}

        {empresaAbajo && (
          <div className="text-gray-400 text-[9px] text-center border-t border-gray-100 pt-2">
            <p className="font-medium text-gray-600">{entidad.razon_social || 'Reformas Ordoñez'}</p>
            <p>{[entidad.direccion, entidad.telefono, entidad.web].filter(Boolean).join(' · ')}</p>
            {lineaFiscal && <p>{lineaFiscal}</p>}
          </div>
        )}

        {tc && (
          <div className="border-t border-gray-200 pt-2">
            <p className="font-semibold uppercase text-[9px] mb-1" style={cardLabelEstilo}>
              {labelTyc}
            </p>
            <div className="text-gray-400 text-[9px] whitespace-pre-line">{tc}</div>
          </div>
        )}

        {piePagina && (
          <p className="text-gray-400 text-[9px] text-center whitespace-pre-line">{piePagina}</p>
        )}

        {mensajeGracias && (
          <p className="italic text-center text-[10px] border-t border-gray-100 pt-2" style={{ color: colorPrimario }}>
            {mensajeGracias}
          </p>
        )}
      </div>
    </div>
  );
}
