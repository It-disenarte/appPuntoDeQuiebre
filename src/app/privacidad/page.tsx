import type { Metadata } from "next";
import { LegalPage } from "@/components/shell/LegalPage";

export const metadata: Metadata = { title: "Aviso de privacidad" };

export default function PrivacidadPage() {
  return (
    <LegalPage title="Aviso de privacidad">
      <h2>Responsable</h2>
      <p>Punto de Quiebre es responsable del tratamiento de tus datos personales.</p>
      <h2>Datos que recabamos</h2>
      <p>
        Nombre, correo, fecha de nacimiento (para verificar mayoría de edad), datos de facturación cuando los solicitas y datos de uso de la app. Los datos
        de tu tarjeta los procesa nuestro proveedor de pagos (Stripe); nosotros nunca los vemos ni los guardamos.
      </p>
      <h2>Para qué los usamos</h2>
      <p>Para darte acceso a la app, cobrar tu suscripción, emitir tus facturas y mejorar tus recomendaciones de contenido.</p>
      <h2>Tus derechos (ARCO)</h2>
      <p>Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos escribiéndonos.</p>
    </LegalPage>
  );
}
