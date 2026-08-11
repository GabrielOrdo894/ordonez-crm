/** @type {import('tailwindcss').Config} */

// Los tokens de tema (marca + gris + superficie) viven en variables CSS "R G B" (ver
// src/styles/globals.css) para poder cambiarlos en runtime según data-tema/data-modo sin
// recompilar Tailwind, conservando el soporte de modificadores de opacidad (ej. bg-white/90).
function conVariable(variable) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: conVariable('--color-brand'),
          dark: conVariable('--color-brand-dark'),
          light: conVariable('--color-brand-light'),
          hover: conVariable('--color-brand-hover'),
          accent: conVariable('--color-brand-accent'),
        },
        gray: {
          50: conVariable('--color-gray-50'),
          100: conVariable('--color-gray-100'),
          200: conVariable('--color-gray-200'),
          300: conVariable('--color-gray-300'),
          400: conVariable('--color-gray-400'),
          500: conVariable('--color-gray-500'),
          600: conVariable('--color-gray-600'),
          700: conVariable('--color-gray-700'),
          800: conVariable('--color-gray-800'),
          900: conVariable('--color-gray-900'),
        },
        surface: conVariable('--color-surface'),
        app: conVariable('--color-app'),
      },
      borderRadius: {
        sm: '0.625rem',
        DEFAULT: '0.875rem',
      },
    },
  },
  plugins: [],
};
