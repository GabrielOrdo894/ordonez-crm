import { Calendar, FileText, MapPin, Image as ImageIcon } from 'lucide-react';
import { tonoOscuro } from '../finanzas/DocumentoPreview';
import { direccionEnDosLineas } from '../../lib/direcciones';
import type { EntidadPais } from '../../lib/pdfEmpresa';

// Convierte una medida en milímetros (A4 = 210 x 297) a "cqw" — 1% del ancho del contenedor.
// Como el contenedor fuerza aspect-ratio 210/297, una misma escala sirve para X, Y, anchos,
// altos y tamaños de fuente sin mezclar unidades (evita el problema de los % verticales en CSS).
function mm(n: number): string {
  return `${((n / 210) * 100).toFixed(3)}cqw`;
}

function pt(n: number): string {
  return mm(n * 0.3528);
}

type PortadaPreviewProps = {
  colorPrimario: string;
  colorSecundario: string;
  logoUrl?: string;
  fotoUrl: string;
  filtroOpacidad: number;
  tagline: string;
  entidad: EntidadPais;
  pais: 'España' | 'Francia';
  tituloProyecto: string;
  esOrientativo: boolean;
  idioma: 'es' | 'fr';
  numero: string;
  fechaEmision: string;
};

const TEXTOS = {
  es: {
    proyecto: 'PROYECTO',
    emision: 'FECHA DE EMISIÓN',
    numero: 'NÚMERO DE PRESUPUESTO',
    empresa: 'EMPRESA',
    descOrientativo: 'Propuesta orientativa de materiales, mano de obra y acabados para su proyecto.',
    descNormal: 'Presupuesto detallado con materiales, mano de obra y acabados para su proyecto.',
    tituloBase: 'PRESUPUESTO',
    etiquetaOrientativo: 'ORIENTATIVO',
  },
  fr: {
    proyecto: 'PROJET',
    emision: "DATE D'ÉMISSION",
    numero: 'NUMÉRO DE DEVIS',
    empresa: 'ENTREPRISE',
    descOrientativo: 'Proposition de prix indicative pour votre projet, à préciser lors de la visite technique.',
    descNormal: "Devis détaillé incluant matériaux, main-d'œuvre et finitions pour votre projet.",
    tituloBase: 'DEVIS',
    etiquetaOrientativo: 'INDICATIF',
  },
};

export function PortadaPreview({
  colorPrimario,
  colorSecundario,
  logoUrl,
  fotoUrl,
  filtroOpacidad,
  tagline,
  entidad,
  pais,
  tituloProyecto,
  esOrientativo,
  idioma,
  numero,
  fechaEmision,
}: PortadaPreviewProps) {
  const t = TEXTOS[idioma];
  const colorOscuro = tonoOscuro(colorPrimario);
  const [dirL1, dirL2] = direccionEnDosLineas(entidad.direccion);

  // Posiciones verticales calibradas para los dos estados de título (1 línea "normal" vs 2 líneas
  // "orientativo") — no se recalculan de forma dinámica, igual que en el PDF donde el ancho del
  // título fuerza el salto de línea.
  const yTitulo = 58;
  const yAccent = esOrientativo ? 86 : 78;
  const yProyectoLabel = yAccent + 10;
  const yProyectoTitulo = yProyectoLabel + 7;
  const yDescripcion = yProyectoTitulo + 15;
  const yFecha = yDescripcion + 20;
  const yNumero = yFecha + 13;

  const yBanda = 243;
  const bandaTopIzq = 228;
  const centroFranja = (bandaTopIzq + 297) / 2;
  const largoDivisoria = 38;
  const xBandaDer = 15 + 95 + 12;
  const rCasa = 6.5;
  const cxCasa = xBandaDer + rCasa;
  const cyCasa = centroFranja - 5;
  const anchoBandaDer = 210 - 15 - xBandaDer;

  return (
    <div
      className="documento-papel relative w-full bg-surface border border-gray-200 overflow-hidden rounded-sm shadow-sm"
      style={{ aspectRatio: '210 / 297', containerType: 'inline-size' }}
    >
      {/* Foto de fondo, recortada en cuña diagonal como en la inspiración */}
      <div
        className="absolute inset-0 bg-gray-100"
        style={{ clipPath: 'polygon(71.43% 0%, 100% 0%, 100% 84.18%, 53.81% 84.18%)' }}
      >
        {fotoUrl ? (
          <img src={fotoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <ImageIcon size={32} />
          </div>
        )}
        <div className="absolute inset-0 bg-surface" style={{ opacity: Math.min(1, Math.max(0, filtroOpacidad / 100)) }} />
      </div>

      {/* Franja verde inferior, borde superior en diagonal */}
      <div
        className="absolute inset-0"
        style={{ clipPath: 'polygon(0% 76.77%, 100% 82.83%, 100% 100%, 0% 100%)', backgroundColor: colorOscuro }}
      />

      {/* Cabecera: logo + razón social */}
      <div className="absolute flex items-center" style={{ left: mm(15), top: mm(11), gap: mm(5) }}>
        {logoUrl && (
          <img src={logoUrl} alt="" className="object-contain" style={{ width: mm(16), height: mm(16) }} />
        )}
        <p className="font-bold" style={{ fontSize: pt(12), color: colorOscuro }}>
          {entidad.razon_social || 'Reformas Ordoñez'}
        </p>
      </div>

      {/* Título grande + línea de acento */}
      <div className="absolute font-bold leading-[1.05]" style={{ left: mm(15), top: mm(yTitulo), width: mm(80), fontSize: pt(esOrientativo ? 23 : 28), color: colorOscuro }}>
        {esOrientativo ? (
          <>
            <div>{t.tituloBase}</div>
            <div>{t.etiquetaOrientativo}</div>
          </>
        ) : (
          <div>{t.tituloBase}</div>
        )}
      </div>
      <div className="absolute" style={{ left: mm(15), top: mm(yAccent), width: mm(32), height: mm(1.4), backgroundColor: colorSecundario }} />

      {/* Proyecto */}
      <p className="absolute font-bold uppercase text-gray-400" style={{ left: mm(15), top: mm(yProyectoLabel), fontSize: pt(8) }}>
        {t.proyecto}
      </p>
      <p className="absolute font-bold leading-tight" style={{ left: mm(15), top: mm(yProyectoTitulo), width: mm(80), fontSize: pt(15), color: colorOscuro }}>
        {tituloProyecto}
      </p>

      {/* Descripción */}
      <p className="absolute text-gray-500 leading-snug" style={{ left: mm(15), top: mm(yDescripcion), width: mm(80), fontSize: pt(9) }}>
        {esOrientativo ? t.descOrientativo : t.descNormal}
      </p>

      {/* Fecha de emisión */}
      <div className="absolute flex items-start" style={{ left: mm(15), top: mm(yFecha), gap: mm(3) }}>
        <Calendar style={{ width: mm(7), height: mm(7) }} color={colorPrimario} strokeWidth={1.8} />
        <div>
          <p className="font-bold text-gray-400" style={{ fontSize: pt(7) }}>{t.emision}</p>
          <p className="font-bold text-gray-900" style={{ fontSize: pt(10) }}>{fechaEmision}</p>
        </div>
      </div>

      {/* Número de presupuesto */}
      <div className="absolute flex items-start" style={{ left: mm(15), top: mm(yNumero), gap: mm(3) }}>
        <FileText style={{ width: mm(7), height: mm(7) }} color={colorPrimario} strokeWidth={1.8} />
        <div>
          <p className="font-bold text-gray-400" style={{ fontSize: pt(7) }}>{t.numero}</p>
          <p className="font-bold text-gray-900" style={{ fontSize: pt(10) }}>{numero}</p>
        </div>
      </div>

      {/* Franja verde: datos de empresa */}
      <div className="absolute text-white" style={{ left: mm(15), top: mm(yBanda), width: mm(95) }}>
        <p className="font-bold uppercase" style={{ fontSize: pt(7.5), opacity: 0.85 }}>{t.empresa}</p>
        <p className="font-bold" style={{ fontSize: pt(10.5), marginTop: mm(2) }}>{entidad.razon_social || 'Reformas Ordoñez'}</p>
        <div className="flex flex-col" style={{ marginTop: mm(4), gap: mm(1.6), fontSize: pt(8), opacity: 0.9 }}>
          {dirL1 && (
            <p className="flex items-center" style={{ gap: mm(1.5) }}>
              <MapPin style={{ width: mm(3), height: mm(3) }} className="shrink-0" />
              {dirL1}
            </p>
          )}
          {dirL2 && <p>{dirL2}</p>}
          {entidad.telefono && <p>{entidad.telefono}</p>}
          {entidad.email && <p>{entidad.email}</p>}
          {entidad.identificador && <p>{pais === 'Francia' ? 'SIRET' : 'CIF'}: {entidad.identificador}</p>}
          {entidad.identificador_extra && (
            <p>{pais === 'Francia' ? `TVA: ${entidad.identificador_extra}` : entidad.identificador_extra}</p>
          )}
        </div>
      </div>

      {/* Línea divisoria corta y centrada en la franja — no de borde a borde */}
      <div
        className="absolute bg-surface"
        style={{ left: mm(110), top: mm(centroFranja - largoDivisoria / 2), width: mm(0.25), height: mm(largoDivisoria) }}
      />

      {/* Franja verde: icono casa (anillo + tejado en arco, como la imagen de inspiración) + tagline */}
      <svg
        viewBox="0 0 100 100"
        className="absolute"
        style={{ left: mm(cxCasa - rCasa), top: mm(cyCasa - rCasa), width: mm(rCasa * 2), height: mm(rCasa * 2) }}
      >
        <circle cx="50" cy="50" r="46" fill="none" stroke="#fff" strokeWidth="3.5" />
        <path
          d="M27,78 L27,40 L50,19 L73,40 L73,78"
          fill="none"
          stroke="#fff"
          strokeWidth="8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <p
        className="absolute italic text-white leading-snug"
        style={{ left: mm(cxCasa - rCasa), top: mm(cyCasa + rCasa + 8), width: mm(anchoBandaDer), fontSize: pt(9) }}
      >
        {tagline}
      </p>
    </div>
  );
}
