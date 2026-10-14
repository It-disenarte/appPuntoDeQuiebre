import type { Metadata, Viewport } from "next";
import { Anton, Archivo } from "next/font/google";
import { connection } from "next/server";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin", "latin-ext"], display: "swap" });
const archivo = Archivo({
  variable: "--font-archivo",
  weight: ["400", "600", "800"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Punto de Quiebre", template: "%s · Punto de Quiebre" },
  description: "Tu marca personal, de “no sé qué grabar” a publicar con constancia y datos.",
  applicationName: "Punto de Quiebre",
  appleWebApp: { capable: true, title: "Punto de Quiebre", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#191BDF",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Todas las páginas se renderizan por petición: es necesario para aplicar el nonce de la CSP
  // (src/proxy.ts) a los scripts de Next. La app es autenticada y dinámica de todos modos.
  await connection();
  return (
    <html lang="es-MX" className={`${anton.variable} ${archivo.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
