import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default [
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "18.3" } },
    plugins: { react, "react-hooks": reactHooks, "react-refresh": reactRefresh, "jsx-a11y": jsxA11y },
    rules: {
      ...react.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // Solo las dos reglas clásicas de hooks (las mismas que trae el
      // template de Vite+React). El preset "recommended" del plugin ahora
      // incluye además las reglas de elegibilidad para el React Compiler
      // (set-state-in-effect, immutability, preserve-manual-memoization…),
      // que marcan como "error" patrones válidos y comunes en este proyecto
      // (sync de formularios con props, valor inicial por defecto) — esas
      // reglas tienen sentido si en algún momento se adopta el compiler,
      // no para un lint básico de "¿rompiste las reglas de hooks?".
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // El código usa comillas rectas dentro de texto JSX (p. ej. cuando
      // muestra un apodo entre comillas) — se renderiza perfecto en todos
      // los navegadores modernos, así que esta regla solo generaría ruido.
      "react/no-unescaped-entities": "off",
      "react-refresh/only-export-components": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Los 4 modales del proyecto usan el backdrop (div de fondo) con
      // onClick={onClose} para cerrar al hacer click fuera — un patrón común
      // e intencional. Escape y el foco ya se manejan por separado en
      // useModalA11y sobre el propio diálogo, así que exigir un keyboard
      // listener en el backdrop en sí es ruido, no un hueco real de a11y.
      // A "warn" para que quede visible sin romper el CI.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
    },
  },
];
