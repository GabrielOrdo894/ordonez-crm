# Tokens de diseño — Reformas Ordoñez

## Tipografía

Desde la actualización de la Home (inspirada en la referencia de `guias/`), el CRM usa
**Poppins** (Google Fonts) en vez de la fuente de sistema:

```html
<!-- index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
```

```css
/* globals.css */
body { font-family: 'Poppins', 'Helvetica Neue', Helvetica, Arial, sans-serif; }
```

Pesos: 400 (texto normal), 500 (labels, énfasis medio), 600 (subtítulos, botones), 700 (títulos, cifras destacadas).

## Bordes

Redefinidos globalmente en `tailwind.config.js` (`theme.extend.borderRadius`) — un solo cambio
afecta a toda la app porque todos los componentes ya usan estas clases estándar:

```
rounded-sm   → 10px   (cards, inputs, botones — antes 2px)
rounded      → 14px   (modales — antes 4px)
rounded-full → circular (avatares, dots de leyenda, pills de segmented control)
```

Ya no aplica la restricción anterior de "rounded-lg o mayor prohibido" — los bordes más
redondeados son ahora el estándar del CRM, inspirados en el diseño de referencia de la Home.

## Colores (Tailwind custom)

```js
// tailwind.config.js
colors: {
  brand: {
    DEFAULT: '#1a5c38',   // verde primario — acciones principales
    dark:    '#0f3d24',   // sidebar, portadas de PDF
    light:   '#eaf2ed',   // fondos suaves, hover de tabla
    hover:   '#cdddd5',   // hover sutil
  }
}
```

Colores de sistema (usar clases Tailwind estándar):
```
Texto principal:   text-gray-900  (#111827)
Texto secundario:  text-gray-600  (#4b5563)
Texto terciario:   text-gray-400  (#9ca3af)
Borde estándar:    border-gray-200 (#e5e7eb)
Fondo página:      bg-[#f4f4f2]
Fondo card:        bg-white
Error:             text-red-700 / bg-red-50
Advertencia:       text-amber-800 / bg-amber-50
Info:              text-blue-800 / bg-blue-50
```

## Estados visuales de visita

```
Pendiente:   text-amber-800 bg-amber-50 border-l-amber-500
Confirmada:  text-blue-800  bg-blue-50  border-l-blue-500
Realizada:   text-brand     bg-brand-light border-l-brand
Cancelada:   text-gray-500  bg-gray-50  border-l-gray-300
```

## Estados del pipeline

```
Contacto inicial      → text-gray-600
Visita programada     → text-blue-700
Visita realizada      → text-violet-700
Presupuesto enviado   → text-amber-700
Presupuesto aceptado  → text-emerald-700
En obra               → text-brand
Finalizado            → text-gray-900
```

## Componentes reutilizables

Badge de estado:
```tsx
<span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium
  bg-amber-50 text-amber-800">Pendiente</span>
```

Separador de sección:
```tsx
<div className="text-xs font-semibold uppercase tracking-widest text-gray-400 py-1
  border-b border-gray-200 mb-2">Sección</div>
```
