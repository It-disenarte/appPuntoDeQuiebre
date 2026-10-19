import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // En pruebas no hay límite cliente/servidor: server-only se vuelve un módulo vacío.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  // Muchos archivos levantan su propia base PGlite en paralelo: con 5 s de límite fallaban pruebas sanas bajo carga.
  test: { environment: "node", include: ["src/**/*.test.ts", "tests/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 },
});
