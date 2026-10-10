# Auditoría de la Galería de proyectos — 2026-10-10

Alcance: `src/modules/galeria/` (GaleriaPage, GaleriaDetallePage, GaleriaMediaPage, GaleriaNuevaPage, obras.ts, types.ts),
la subida desde `/rapido` (`seccionesMedia.tsx`, `envios.ts`), el bucket `galeria` y la tabla `galeria`. Revisado el código,
los datos reales en producción, las tres pantallas en el navegador y 81 páginas de internet (dos investigaciones: una de
diseño/usabilidad y otra técnica; la lista completa de fuentes está al final).

## 1. Estado real

- 2 fichas de obra, 27 fotos, 0 vídeos. 29 archivos en el bucket, 44 MB (media 1,5 MB; las últimas subidas ya
  optimizadas rondan 180-260 KB, las de septiembre llegan a 2,7 MB).
- `tipo_obra` de las dos fichas es el título del presupuesto copiado («Devis — Remplacement du receveur…»): no existe una
  clasificación real.
- `publicado`/`destacado` no se usan en ningún otro sitio del CRM ni de la web. `/fr/nos-renovations/` y `/proyectos/` siguen
  con fotos de stock de Unsplash.
- **Supabase no tiene transformaciones de imagen** (probado: `/render/image/...` devuelve `FeatureNotEnabled`; es solo del
  plan Pro). No hay miniaturas: cada tarjeta y cada miniatura descarga la foto completa.
- La única dependencia de la galería es `jszip` (también usado en Facturas, Presupuestos y Proveedores).

## 2. Hallazgos

### Graves

| # | Hallazgo | Dónde |
|---|---|---|
| G1 | Cada miniatura carga el original (1,5 MB de media). Una obra de 20 fotos = 30 MB solo para ver la rejilla. Sin `loading="lazy"`, sin `width/height`, sin `decoding="async"`. | GaleriaPage, Detalle, Media |
| G2 | Reordenar fotos usa el arrastrar nativo HTML5: no funciona con el dedo en el móvil ni con teclado. | GaleriaMediaPage `draggable` |
| G3 | Al borrar una foto se elimina primero el archivo del bucket y después se actualiza la ficha; si falla la segunda llamada queda una foto rota en la ficha. Mismo orden al eliminar la obra entera (borra archivos uno a uno, luego la fila). | `handleEliminarFoto`, `eliminarProyectoMutation` |
| G4 | Leer-modificar-escribir del array `fotos` sin control de concurrencia: si Gabriel y Ricardo tocan la misma obra a la vez, el último pisa al otro y se pierden fotos en silencio. También en `enviarFotosObra` de /rapido. | Media, envios.ts |
| G5 | Un vídeo subido se usa como miniatura con `<video src>`: el navegador descarga el vídeo entero para pintar un cuadrado (hasta 100 MB). | Page, Detalle, Media |

### Importantes

| # | Hallazgo |
|---|---|
| I1 | Filtro «Tipo de obra» inútil (valores = títulos de presupuesto). Falta una lista cerrada de tipos. |
| I2 | Tres pantallas para una obra (lista → ficha → medios). La ficha queda casi vacía; el visor obliga a cambiar de página. |
| I3 | Visor sin teclado (←/→/Esc), sin deslizar en móvil, sin zoom, sin pantalla completa, sin contador «3 / 14», sin precarga. |
| I4 | Subida: `<input type=file>` a secas. Sin arrastrar archivos, sin vista previa, sin progreso por archivo, sin botón de cámara en la galería de escritorio/móvil (solo en /rapido), fotos subidas una a una en serie. |
| I5 | No se puede elegir la portada (sale la primera del array, que depende de la categoría que se subió antes). |
| I6 | Tarjeta de obra sin nombre del cliente, sin nº de fotos, sin indicador antes/después, fecha en bruto `2026-09-06` (convención del CRM: `06 sept 26`). |
| I7 | «Destacado» y «Publicado» se cambian pulsando la etiqueta, sin pista visual; «publicado» no conecta con nada. |
| I8 | HEIC de iPhone: `createImageBitmap` falla en Chrome y se sube el HEIC original, que no se ve en Windows. No se valida el MIME. |
| I9 | Sin acciones en lote (mover de categoría, borrar, descargar varias). Sin comparador antes/después. Sin búsqueda por cliente. |
| I10 | Descarga ZIP sin progreso y todo en memoria (JSZip); con vídeos puede tumbar la pestaña en un móvil. |
| I11 | Las fotos se guardan como JPEG; WebP pesa un 25-35 % menos con la misma calidad y lo soportan todos los navegadores actuales. |

### Menores

- Estados vacíos sin acción («No hay proyectos en la galería»).
- Miniaturas sin `alt` útil, botones de icono sin `aria-label`, miniaturas con `onClick` en un `div` (no accesibles por teclado).
- Fecha de la obra = fecha de emisión del presupuesto, no de las fotos (EXIF).
- `queryKey ['galeria']` se usa para la lista y `['galeria', id]` para la ficha: bien, pero invalidar `['galeria']` recarga también
  `obras-disponibles` (tres consultas) en cada cambio de foto.
- `GaleriaNuevaPage` (ficha manual) duplica el formulario de datos de `GaleriaDetallePage`.
- Políticas de Storage del bucket `galeria`: sin `update` (coherente), pero `insert`/`delete` sin `es_miembro_equipo()` según
  `docs/tecnico/supabase-schema.md` — comprobar en producción (el resto de buckets ya lo exigen desde el 2026-10-01).

## 3. Lo que dice la investigación (resumen aplicable)

- **Rejilla**: tiles cuadrados (`aspect-ratio: 1/1` + `object-fit: cover`) para fotos de una obra; cards solo para la lista de
  obras; 3 columnas en móvil, 6-8 en escritorio; evitar masonry (rompe el orden y el arrastre). (NN/g cards, MDN aspect-ratio,
  Flickr justified-layout)
- **Visor**: `<dialog>` + `showModal()` (foco atrapado, Esc, fondo inerte gratis); Esc/←/→; deslizar para pasar y arrastrar
  hacia abajo para cerrar; pinch/doble toque para ampliar cargando la versión grande (el 40 % de sitios no lo tiene y los
  usuarios lo intentan igual); contador; miniaturas, no puntos; precargar ±1. (W3C APG, MDN dialog, Baymard, PhotoSwipe)
- **Miniaturas**: sin plan Pro, generarlas en el cliente al subir (400 px WebP ≈ 20-40 KB) y guardar dos archivos; `loading="lazy"`
  salvo las 6 primeras; `width/height` siempre. (Supabase docs, web.dev lazy-loading / LCP / CLS)
- **Vídeo**: póster generado en el cliente (`requestVideoFrameCallback`), `preload="none"`, `playsInline`, duración visible,
  nunca `<video>` como miniatura. (MDN video, web.dev lazy-loading-video, WebKit #236604)
- **Subida**: zona de arrastre + botón; en móvil dos botones («Hacer foto» con `capture`, «Elegir de la galería» sin él);
  límites visibles antes de elegir («quedan 14 de 20»); vista previa inmediata; progreso por archivo; reintentar el que falle;
  `accept="image/*"` sin `image/heic` (Safari 17 convierte todo a HEIC si lo ves en la lista). (MDN input file, Uppy,
  Filestack, Apple forums)
- **Reordenar**: dnd-kit (`PointerSensor` con `delay 150-200 ms` + `KeyboardSensor`, anuncios en español) y además botones
  «mover» como vía sin arrastre (WCAG 2.2 2.5.7). (dndkit.com, NN/g drag-drop)
- **Comparador antes/después**: `input type=range` + `clip-path` (40 líneas, accesible); dejar elegir el par a mano y ofrecer
  también lado a lado, porque en obra las fotos rara vez tienen el mismo encuadre. (dev.to WCAG 2.2, react-compare-slider)
- **Selección múltiple**: casilla al pasar el ratón / pulsación larga en móvil, Shift+clic para rango, barra de acciones.
  (patrón Google Photos; el CRM ya tiene `useSeleccionMultiple` + `BulkActionsBar`)
- **Filtros**: chips con contador si ≤ 5 opciones; select solo para zona. (NN/g listbox)
- **ZIP**: `client-zip` (2,7 kB, streaming) en vez de JSZip (28 kB, todo en memoria). (client-zip, JSZip limitations)
- **Compartir**: el bucket es público, así que cada URL ya es un enlace permanente; Web Share API con archivos manda fotos
  reales a WhatsApp desde el móvil; enlace de obra para el cliente exigiría una Edge Function pública con token.
- **Referencias de producto**: CompanyCam (línea de tiempo por fecha de captura, par antes/después, galería compartible),
  Procore (visor de dos paneles: foto + metadatos editables), Buildertrend (visibilidad interno/cliente).

## 4. Propuesta de nueva versión

### Estructura

Dos pantallas en vez de tres:

1. **`/galeria`** — lista de obras: buscador por cliente/título, chips de tipo de obra con contador, select de zona, chip
   «Destacadas» y «En la web»; tarjetas con portada (miniatura), cliente, título, zona, fecha formateada, «12 fotos · 3 antes ·
   6 después», estrella y globo. Arriba: «Añadir fotos a una obra» (desplegable actual) y «Subir desde el móvil». Estados vacíos
   con acción.
2. **`/galeria/:id`** — la obra entera en una página, layout `[1fr_360px]` como `DocumentoDetalleInline`:
   - Columna principal: zona de subida (arrastrar / elegir / hacer foto, con categoría, límites y cola con progreso); chips
     Antes · Durante · Después · Detalles · Todas con contador; rejilla de tiles cuadrados con miniaturas, estrella de portada,
     icono y duración en vídeos, casilla de selección; barra de acciones en lote (mover a categoría, portada, descargar, borrar);
     comparador antes/después con selección del par.
   - Panel lateral: datos de la obra (título, tipo de obra en lista cerrada, zona de Configuración, fecha, descripción) editables
     con «Modificar» + confirmación como el resto del CRM; interruptores claros «Destacada» y «Visible en la web»; relaciones
     (presupuesto, facturas, planning); descargar ZIP; compartir (Web Share / copiar enlaces); eliminar.
   - Visor en `<dialog>` a pantalla completa: ←/→/Esc, deslizar, zoom, contador, pie con título/descripción editable, botones
     descargar / mover de categoría / portada / eliminar.
3. `/galeria/:id/media` desaparece (redirige a la ficha). `/galeria/nueva` se queda igual.

### Modelo de datos

Sin tabla nueva. Columnas nuevas en `galeria`: `portada_url text`, `tipo_obra_clave text` (lista cerrada), `updated_at timestamptz`
(para el control de concurrencia). Campos nuevos en cada elemento del jsonb `fotos`: `thumb_url`, `ancho`, `alto`,
`poster_url` y `duracion` (vídeo), `fecha_captura` (EXIF, opcional). Los elementos antiguos sin `thumb_url` se migran una vez
desde el navegador (botón «Generar miniaturas» que desaparece al terminar).

Escrituras del array siempre con comprobación optimista (`.eq('updated_at', visto)`); si choca, se recarga y se reintenta.
Borrado: primero la fila, después los archivos (una sola llamada `remove([...])`); un archivo huérfano es inofensivo, una
ficha con enlace roto no.

### Técnica

| Pieza | Decisión |
|---|---|
| Miniaturas y WebP | A mano con el canvas que ya existe (`optimizarImagen.ts`): original ≤ 2000 px WebP q0,82 + miniatura 480 px WebP. |
| Póster de vídeo | A mano (`requestVideoFrameCallback`, fallback `seeked` + rAF). Límite 50 MB (tope del plan). |
| Subida | A mano: cola con estado por archivo, 3 en paralelo, reintento, `accept="image/*"` + `video/mp4,video/quicktime,video/webm`; rechazo claro de HEIC/HEVC. |
| Visor | `yet-another-react-lightbox` + plugins Zoom, Video, Captions, Counter (~20 kB gzip, MIT): pinch-zoom, deslizar, teclado, precarga y accesibilidad resueltos. Alternativa sin dependencia: `<dialog>` a mano sin zoom. |
| Reordenar | `@dnd-kit/core` + `@dnd-kit/sortable` (~20 kB, MIT) + botones «mover» en el menú de cada foto. |
| Comparador | A mano (`range` + `clip-path`). |
| ZIP | `client-zip` (2,7 kB) con progreso; JSZip sigue en Facturas/Presupuestos/Proveedores. |
| Compartir | Web Share API con archivos (móvil) + copiar enlaces. Enlace público para el cliente: fase aparte. |

Peso añadido: ≈ 43 kB gzip. Todo MIT.

### Fases

1. **Base y rendimiento** (G1, G3, G4, G5, I8, I11): miniaturas, WebP, póster, lazy, borrado seguro, concurrencia, migración
   de las 27 fotos. Sin cambio visual grande.
2. **Nueva ficha de obra** (I2, I3, I4, I5, I7, G2): página única, subida nueva, rejilla, visor, dnd-kit, portada, lote.
3. **Lista de obras y clasificación** (I1, I6, I9): tipos cerrados, chips, buscador, tarjetas nuevas, comparador.
4. **Compartir y web** (opcional): Web Share, y conectar «Visible en la web» con `/nos-renovations/` y `/proyectos/`.

Cada fase: tests Vitest de la lógica pura (cola de subida, reorden, comparación optimista, migración), `tsc -b`, eslint, prueba
en navegador de escritorio y móvil, y nota en CLAUDE.md §10.

## 5. Fuentes consultadas (81)

Diseño y usabilidad (40): NN/g drag-drop · NN/g empty-state · NN/g cards · NN/g modal-nonmodal · NN/g image-focused-design ·
NN/g listbox-dropdown · NN/g filters-vs-facets · W3C APG dialog-modal · MDN dialog · MDN input/file · MDN video · MDN
aspect-ratio · web.dev browser-level-image-lazy-loading · web.dev lcp-lazy-loading · web.dev optimize-cls · web.dev
lazy-loading-video · web.dev responsive-images · Supabase image-transformations · dndkit.com accessibility · Flickr
justified-layout (GitHub) · code.flickr.net much-photos · react-photo-gallery README · photoswipe.com ·
yet-another-react-lightbox.com · react-compare-slider · img-comparison-slider · dev.to before-and-after sliders WCAG 2.2 ·
Baymard mobile-image-gestures · Baymard always-use-thumbnails · Baymard truncating-gallery-thumbnails · Baymard image-gallery
overlay · Smashing drag-drop file uploader · Uploadcare file-uploader UX · Filestack file-upload UI patterns · Uppy Dashboard ·
CompanyCam features · Procore Photos · Buildertrend files · pqina iOS scroll lock · Google Photos selección múltiple.

Técnica (41): Supabase image-transformations · Supabase pricing · Supabase standard-uploads · Supabase resumable-uploads ·
Supabase file-limits · Supabase access-control · Supabase smart-cdn · Supabase createSignedUrl · Supabase remove · MDN dialog ·
MDN inert · W3C APG dialog · MDN scrollbar-gutter · pqina iOS · YARL (GitHub) · PhotoSwipe getting-started · PhotoSwipe
(GitHub) · use-gesture options · MDN touch-action · dnd-kit (GitHub) · pragmatic-drag-and-drop (GitHub) · pkgpulse dnd
comparison · react-compare-slider (GitHub) · img-comparison-slider (GitHub) · react-dropzone (GitHub) · exifr (GitHub) · MDN
createImageBitmap · MDN toBlob · Apple forums HEIC accept · WebKit #236604 · MDN requestVideoFrameCallback · web.dev
lazy-loading · web.dev fetch-priority · MDN img · MDN content-visibility · client-zip (GitHub) · JSZip limitations · MDN
showSaveFilePicker · MDN navigator.share · dev.to jsonb TOAST · W3C APG listbox-rearrangeable · bundlephobia (pesos).

## 6. Estado a 10 de octubre de 2026 (tarde)

Hechas las fases 1, 2 y 3 en una sola tanda (sin commit ni despliegue todavía):

- `galeria/media.ts` (+ tests): validación, procesado WebP + miniatura, póster de vídeo, subida con rutas únicas,
  `guardarFotos` optimista, `borrarArchivos`, `completarMiniaturas`, `comoJpeg`, `descargarBlob`.
- `GaleriaDetallePage.tsx` nueva (una sola página), `SubidaFotos.tsx`, `RejillaFotos.tsx` (dnd-kit), `VisorFotos.tsx`
  (yet-another-react-lightbox), `ComparadorAntesDespues.tsx`; `GaleriaMediaPage.tsx` eliminada y su ruta redirige.
- `GaleriaPage.tsx` nueva: buscador, chips de tipo con contador, zona, orden, destacadas, «en la web», tarjetas con
  miniatura, cliente y recuento por categoría.
- Migración `20261010100000_galeria_updated_at_portada_tipo.sql` aplicada en producción (`updated_at` + trigger,
  `portada_url`, `tipo_obra_clave`). `/rapido` (`envios.ts`) usa la misma cadena de subida.
- Probado en el navegador (servidor local contra la base real): lista, ficha, miniaturas generadas para las 7 fotos
  antiguas de la obra Courally, visor con teclado, subida por arrastre (WebP + miniatura + medidas), menú por foto y
  borrado con confirmación. Sin probar: móvil real, vídeo real, compartir por WhatsApp, reordenación con el dedo.
- Pendiente de Gabriel: clasificar las dos obras existentes (tipo de obra) y, si quiere, elegir portada.
- Fase 4 (web + enlace de obra) aprobada por Gabriel el 2026-10-10, por hacer.
