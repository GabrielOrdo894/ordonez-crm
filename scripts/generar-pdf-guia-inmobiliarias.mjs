// Lista priorizada de inmobiliarias locales para alianzas de referidos.
// Uso: node scripts/generar-pdf-guia-inmobiliarias.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { jsPDF } from 'jspdf';
import { COLOR, tituloSeccion, parrafo, bullets, cajaNota, cabecera, piePaginas } from './pdf-tema.mjs';

const doc = new jsPDF({ unit: 'mm', format: 'a4' });

let y = cabecera(doc, {
  etiqueta: 'Estrategia · Alianzas',
  titulo: 'Alianzas con inmobiliarias locales',
  meta: 'Reformas Ordoñez · Lista priorizada + cómo abordar el primer contacto',
});

y = tituloSeccion(doc, y, 'Por qué esta alianza');
y = parrafo(doc, y, 'Un comprador de vivienda antigua que necesita reformarla es el lead más caliente que existe: llega justo en el momento de decidir con quién reformar. Una alianza con inmobiliarias de la zona os pone delante de esos compradores antes que la competencia, sin gastar en publicidad.');
y += 4;

y = tituloSeccion(doc, y, 'Cómo abordar el primer contacto');
y = bullets(doc, y, [
  'Empieza sin comisión ni contrato: propuesta de pura reciprocidad ("os derivo cuando un cliente necesita reforma tras comprar, vosotros me derivais cuando alguien pregunta por reformistas de confianza"). Reduce la fricción del primer "sí".',
  'Prioriza agencias independientes/locales frente a grandes franquicias — deciden solas, sin política de red de por medio.',
  'Solo cuando veas que genera negocio real, formaliza una comisión o porcentaje.',
  'Registra en el CRM de dónde viene cada lead de alianza (campo "referido por") para saber cuál convierte de verdad.',
]);
y += 6;

y = tituloSeccion(doc, y, 'Prioridad alta — ya operan a ambos lados de la frontera, como vosotros');
y = bullets(doc, y, [
  'Onara Hábitat — Hondarribia, Irún, Donostia, Astigarraga, Hendaya y Biarritz. Cobertura que más coincide con vuestra zona exacta. Web: onarahabitat.com',
  'Urme Inmobiliaria — Irún, con alcance a Donostia, Hondarribia y Hendaya. Web: urme.es',
]);
y += 6;

y = tituloSeccion(doc, y, 'Lado francés — Hendaya (vuestra propia sede)');
y = bullets(doc, y, [
  'Hendaye Immobilier — independiente desde 1975, dirigida por Maité Mestre, ~70 reseñas positivas. Web: hendayeimmobilier.com',
  'EKI Immobilier — pequeña, agente de larga trayectoria en el puerto de Hendaya. Web: eki-immobilier.com',
  'RPI Immobilier — venta/alquiler de gama media-alta en Hendaya. Web: rpi-immobilier.com',
]);
y += 6;

y = tituloSeccion(doc, y, 'Lado español — Hondarribia / Irún');
y = bullets(doc, y, [
  'Inmobiliaria AM. Sorolla — Hondarribia, también atiende Irún. Web: inmobiliariaamsorolla.es',
  'Inmobiliaria Ibáñez — pequeña, local, en Hondarribia. Web: inmobiliariajesusibanez.com',
  'Moldatu Home — Irún, Donostia y Hondarribia. Web: moldatuhome.com',
]);
y += 6;

y = tituloSeccion(doc, y, 'Zona ampliada — Saint-Jean-de-Luz / Biarritz (ticket más alto)');
y = bullets(doc, y, [
  'Duhart Immobilier — independiente desde 1979, no es cadena. Web: duhart-immobilier.com',
  'Olaizola — agencia local e independiente en Saint-Jean-de-Luz.',
]);
y += 6;

y = tituloSeccion(doc, y, 'Orden sugerido de contacto');
y = bullets(doc, y, [
  '1. Onara Hábitat y Urme — cubren vuestra zona exacta a ambos lados de la frontera.',
  '2. Hendaye Immobilier — la más cercana a vuestra propia oficina.',
  '3. Resto de la lista, según disponibilidad y respuesta de las anteriores.',
]);
y += 4;

y = cajaNota(doc, y, 'Esta lista sale de reseñas y directorios públicos, no de verificación directa — confirma que siguen activas antes de contactar.', 'ambar');

piePaginas(doc, 'Reformas Ordoñez · Guía interna de marketing');

const outputPath = 'negocio/equipo-marketing/guias/alianzas-inmobiliarias-locales.pdf';
mkdirSync('negocio/equipo-marketing/guias', { recursive: true });
writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
console.log('PDF generado:', outputPath);
