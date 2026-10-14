// Empaqueta los procesos de Node que corren fuera de Next (migraciones, CLI y worker) en dist/.
import { build } from "esbuild";

await build({
  entryPoints: {
    migrate: "scripts/migrate.ts",
    cli: "scripts/cli.ts",
    worker: "src/worker/index.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // server-only resuelve a un módulo vacío con esta condición.
  conditions: ["react-server"],
  // Binario nativo: se instala en la imagen final.
  external: ["@node-rs/argon2"],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  sourcemap: true,
  logLevel: "info",
});
