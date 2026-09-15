// Guía paso a paso: retargeting con GA4 + Google Ads (Forminator + Landbot).
// Uso: node scripts/generar-pdf-guia-retargeting.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { jsPDF } from 'jspdf';
import { COLOR, MARGEN, ANCHO_UTIL, cabecera, tituloSeccion, parrafo, bullets, cajaNota, piePaginas } from './pdf-tema.mjs';

function bloqueCodigo(doc, y, lineas) {
  const alto = lineas.length * 4.2 + 6;
  if (y + alto > 280) { doc.addPage(); y = MARGEN; }
  doc.setFillColor(...COLOR.gray900);
  doc.roundedRect(MARGEN, y, ANCHO_UTIL, alto, 1.5, 1.5, 'F');
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.blanco);
  let ly = y + 5;
  for (const l of lineas) {
    doc.text(l, MARGEN + 3, ly);
    ly += 4.2;
  }
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR.gray900);
  return y + alto + 6;
}

const doc = new jsPDF({ unit: 'mm', format: 'a4' });

let y = cabecera(doc, {
  etiqueta: 'Guía técnica · Marketing',
  titulo: 'Retargeting: GA4 + Google Ads',
  meta: 'Reformas Ordoñez · Paso a paso para Forminator y Landbot',
});

y = tituloSeccion(doc, y, 'Qué es y por qué usarlo');
y = parrafo(doc, y, 'El retargeting (o remarketing) es publicidad dirigida solo a personas que ya visitaron tu web pero no dejaron ninguna solicitud. Como ya te conocen, convierte mucho mejor y más barato que un anuncio a público totalmente nuevo. Ejemplo: alguien mira "reforma de baño en Hendaya" y no rellena el formulario — más tarde ve un anuncio tuyo con fotos de baños reformados.');
y += 4;

y = tituloSeccion(doc, y, 'Punto de partida');
y = parrafo(doc, y, 'Ya tienes la propiedad de GA4 creada y funcionando, pero sin ningún tag instalado en el sitio — hoy no se registra ninguna visita todavía. Los formularios activos son Forminator (WordPress) y Landbot. Este es el camino más corto para tener remarketing funcionando de verdad.');
y += 4;

y = tituloSeccion(doc, y, 'Paso 1 — Instalar Google Tag Manager (GTM)');
y = parrafo(doc, y, 'GTM es un contenedor que te deja añadir y gestionar todas las etiquetas de seguimiento (GA4, Google Ads, futuras) desde un panel, sin tocar código cada vez que necesites una nueva.');
y = bullets(doc, y, [
  'Crea una cuenta y un contenedor en tagmanager.google.com — te da un ID tipo GTM-XXXXXXX.',
  'Instálalo en WordPress con el plugin "GTM4WP" o "GTM Kit" (Plugins -> Añadir nuevo -> busca "Google Tag Manager").',
  'Pega tu ID de contenedor en la configuración del plugin y guarda — ya queda instalado en todas las páginas del sitio.',
]);
y += 4;

y = tituloSeccion(doc, y, 'Paso 2 — Conectar GA4 dentro de GTM');
y = bullets(doc, y, [
  'En GTM -> Etiquetas -> Nueva -> tipo "Google Analytics: Configuración de GA4".',
  'Pega tu ID de medición (GA4 -> Administrador -> Flujos de datos -> tu flujo web -> formato G-XXXXXXX).',
  'Activador: "All Pages" (todas las páginas).',
  'Publica el contenedor con el botón "Enviar" arriba a la derecha en GTM.',
]);
y += 4;

doc.addPage();
y = MARGEN;

y = tituloSeccion(doc, y, 'Paso 3 — Trackear los formularios de Forminator');
y = parrafo(doc, y, 'Forminator envía el formulario sin recargar la página (AJAX), así que el disparador estándar de GTM no lo detecta solo. Dos caminos posibles:');
y += 2;

doc.setFont('helvetica', 'bold');
doc.setFontSize(9.5);
doc.setTextColor(...COLOR.verde);
doc.text('Opción recomendada — sin recargar la página', MARGEN, y);
doc.setTextColor(...COLOR.gray900);
doc.setFont('helvetica', 'normal');
y += 6;
y = parrafo(doc, y, 'Añade una etiqueta de tipo "HTML personalizado" en GTM, activada en todas las páginas, con este código:');
y = bloqueCodigo(doc, y, [
  "document.addEventListener('forminator:form:submit:success', function(e) {",
  "  window.dataLayer.push({",
  "    event: 'formSubmission',",
  "    formId: e.detail?.response?.formId",
  "  });",
  '});',
]);
y = parrafo(doc, y, 'Luego crea un Activador tipo "Evento personalizado" con nombre "formSubmission", y una etiqueta GA4 Evento (nombre de evento: "generate_lead") que se dispare con él.');
y += 4;

doc.setFont('helvetica', 'bold');
doc.setFontSize(9.5);
doc.setTextColor(...COLOR.ambar);
doc.text('Opción sin código — más simple, con recarga de página', MARGEN, y);
doc.setTextColor(...COLOR.gray900);
doc.setFont('helvetica', 'normal');
y += 6;
y = parrafo(doc, y, 'En cada formulario de Forminator -> pestaña Comportamiento -> cambia el método de envío a "Recarga de página". Así el disparador nativo "Envío de formulario" de GTM lo detecta solo, sin JavaScript. La única pega: la página recarga al enviar (peor experiencia, pero cero código).');
y += 6;

y = tituloSeccion(doc, y, 'Paso 4 — Trackear Landbot');
y = parrafo(doc, y, 'Landbot tiene integración nativa con GA4 — no hace falta GTM para esta parte.');
y = bullets(doc, y, [
  'Dentro del editor de tu bot -> Integraciones -> Google Analytics.',
  'Pega tu ID de medición de GA4 (mismo formato G-XXXXXXX).',
  'Configura el evento en el bloque final del bot, cuando el usuario completa sus datos de contacto — así cada conversación completa cuenta como conversión.',
]);

doc.addPage();
y = MARGEN;

y = tituloSeccion(doc, y, 'Paso 5 — Marcar los eventos como conversión en GA4');
y = bullets(doc, y, [
  'GA4 -> Administrador -> Eventos.',
  'Busca "generate_lead" (Forminator) y el evento que hayas creado en Landbot.',
  'Actívalos como "Evento clave" — es el marcador de conversión dentro de GA4.',
]);
y += 4;

y = tituloSeccion(doc, y, 'Paso 6 — Vincular GA4 con Google Ads');
y = parrafo(doc, y, 'Este es el paso que realmente activa el remarketing — GA4 por sí solo mide visitas, pero no muestra ningún anuncio.');
y = bullets(doc, y, [
  'GA4 -> Administrador -> Enlaces de producto -> Google Ads -> Vincular.',
  'Sigue el asistente y confirma la cuenta de Google Ads que quieras usar (o crea una nueva).',
]);
y += 4;

y = tituloSeccion(doc, y, 'Paso 7 — Crear la audiencia y lanzar la campaña');
y = bullets(doc, y, [
  'GA4 -> Administrador -> Audiencias -> Nueva audiencia.',
  'Defínela como "visitó el sitio pero no generó ningún Evento clave" en los últimos 30 días.',
  'Con el enlace del paso 6 ya activo, esa audiencia se exporta sola a Google Ads.',
  'En Google Ads, crea una campaña "Display" (o "Búsqueda") apuntando a esa audiencia. Presupuesto orientativo para empezar: 50-100 €/mes.',
]);
y += 4;

y = tituloSeccion(doc, y, 'Paso 8 — Verificar que todo funciona');
y = bullets(doc, y, [
  'En GTM, usa "Vista previa" y navega tu propia web — el evento "formSubmission" debe dispararse al rellenar un formulario de prueba.',
  'En GA4 -> Informes -> Tiempo real (o Admin -> DebugView) — confirma que las visitas y el evento de conversión aparecen.',
]);
y += 4;

y = cajaNota(doc, y, 'IMPORTANTE — Instagram/Facebook es aparte: GA4 + Google Ads solo da remarketing dentro del ecosistema de Google (Display, YouTube, Búsqueda). Si más adelante quieres remarketing en Instagram o Facebook, hace falta instalar el Meta Pixel — es un tag independiente, no lo sustituye ni lo incluye GA4.', 'ambar');

y = tituloSeccion(doc, y, 'Checklist resumen');
y = bullets(doc, y, [
  '[ ] Contenedor GTM creado e instalado en WordPress',
  '[ ] Etiqueta de Configuración GA4 creada dentro de GTM y publicada',
  '[ ] Evento de Forminator conectado (código o método "Recarga de página")',
  '[ ] Integración nativa de Google Analytics activada en Landbot',
  '[ ] Ambos eventos marcados como "Evento clave" en GA4',
  '[ ] GA4 vinculado con Google Ads',
  '[ ] Audiencia de remarketing creada',
  '[ ] Campaña de Display/Búsqueda lanzada con presupuesto de prueba',
  '[ ] Verificado con Vista previa de GTM + Tiempo real de GA4',
]);

piePaginas(doc, 'Reformas Ordoñez · Guía interna de marketing');

const outputPath = 'negocio/equipo-marketing/guias/retargeting-ga4-google-ads.pdf';
mkdirSync('negocio/equipo-marketing/guias', { recursive: true });
writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
console.log('PDF generado:', outputPath);
