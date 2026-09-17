import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
  },
  build: {
    rollupOptions: {
      output: {
        // Separa las librerías base (cambian casi nunca) del código propio
        // (cambia en cada deploy) — así el navegador puede seguir usando su
        // caché de este chunk entre versiones, en vez de re-descargar React
        // + Router + Query + i18next enteros cada vez que se toca una página.
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          "vendor-query-i18n": ["@tanstack/react-query", "i18next", "react-i18next", "i18next-browser-languagedetector"],
        },
      },
    },
  },
});
