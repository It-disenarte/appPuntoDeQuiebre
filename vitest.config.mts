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
  test: { environment: "node", include: ["src/**/*.test.ts", "tests/**/*.test.ts"] },
});
