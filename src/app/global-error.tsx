"use client";

// Último recurso: falla el diseño raíz. Define su propio documento y estilos en línea (los estilos globales no cargan aquí).
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es-MX">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f4f4f6", color: "#09080d" }}>
        <div role="alert" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>Estamos teniendo algunos problemas</h1>
          <p style={{ maxWidth: 420, margin: 0, color: "#4a4955" }}>Algo no salió como esperábamos, pero tu información está a salvo. Intenta de nuevo en un momento.</p>
          <button type="button" onClick={() => retry()} style={{ background: "#191BDF", color: "#fff", border: 0, borderRadius: 999, padding: "14px 28px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
            Intentar de nuevo
          </button>
          {error.digest && <p style={{ fontSize: 12, color: "#8a8994", margin: 0 }}>Código para soporte: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
