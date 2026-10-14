import type { Metadata, Viewport } from "next";
import { Anton, Archivo } from "next/font/google";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`${anton.variable} ${archivo.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
