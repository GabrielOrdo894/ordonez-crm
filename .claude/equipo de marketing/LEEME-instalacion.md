# Equipo de agentes de marketing — Reformas Ordoñez

## Instalación

Estructura del proyecto `marketing-ordonez/`:

```
marketing-ordonez/
├── .claude/
│   └── agents/
│       ├── investigador-contenidos.md
│       ├── copywriter-blog.md
│       ├── revisor-seo.md
│       └── interlinking-maquetacion.md
├── recursos/
│   ├── calendario-editorial.md      ← tu calendario con las keywords (lo das tú)
│   └── plantillas-cta.html          ← tus plantillas de CTA de WordPress
├── dossiers/                        ← salida del investigador
├── articulos/                       ← salida del copywriter
├── publicar/                        ← HTML final del maquetador
└── CLAUDE.md                        ← instrucciones generales del proyecto
```

Los agentes se cargan al arrancar Claude Code en esta carpeta. Si ya había una sesión abierta, reiníciala.

## Flujo de trabajo por artículo

1. Tú entregas la keyword y el brief (del calendario editorial) — **las keywords siempre las eliges tú**
2. `investigador-contenidos` → genera `dossiers/[keyword].md` con datos, fuentes y ángulo de zona
3. `copywriter-blog` → redacta `articulos/[keyword].md` con brief + dossier
4. `revisor-seo` → audita y devuelve correcciones concretas; el copywriter las aplica
5. `interlinking-maquetacion` → lee el sitemap, propone enlaces y lead magnet, y entrega `publicar/[slug].html` listo para pegar en WordPress

Puedes lanzar el flujo completo en una orden: "artículo para la keyword X: investiga, redacta, revisa y maquétalo".

## Recursos que debes colocar tú (primera sesión)

- **`recursos/plantillas-cta.html`** — tus plantillas de CTA actuales de WordPress.
- **`recursos/calendario-editorial.md`** — tu calendario con keywords, títulos y briefs (o pégalo en cada sesión).

## Qué NO hacen estos agentes

- No eligen keywords ni temas: siempre vienen de tu estudio o calendario.
- No publican en WordPress: el maquetador entrega el HTML y tú lo publicas.
- El interlinking solo propone URLs confirmadas en el sitemap o páginas fijas conocidas.

## Sugerencia opcional

Si conectas el MCP de Ahrefs a este proyecto, el investigador puede verificar volúmenes y dificultad de las keywords de tu calendario como comprobación — sin sustituir tu criterio.
