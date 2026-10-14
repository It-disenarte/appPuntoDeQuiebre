import type { Metadata } from "next";
import { LegalPage } from "@/components/shell/LegalPage";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default function TerminosPage() {
  return (
    <LegalPage title="Términos y condiciones">
      <h2>1. El servicio</h2>
      <p>Punto de Quiebre ofrece una app para crear contenido de marca personal: guías, guiones, herramientas de grabación, publicación y métricas.</p>
      <h2>2. Edad mínima</h2>
      <p>La app es solo para personas mayores de 18 años.</p>
      <h2>3. Suscripción y cobro</h2>
      <p>
        Los planes se cobran de forma automática cada mes con la tarjeta registrada. Con un código de prueba, el primer cobro ocurre al terminar el periodo
        gratuito. Puedes cancelar cuando quieras desde la app; el acceso se mantiene hasta el final del periodo pagado.
      </p>
      <h2>4. Pagos fallidos</h2>
      <p>Si un cobro falla, se reintenta durante un periodo de gracia. Si no se regulariza, el acceso se suspende hasta que se actualice el pago.</p>
      <h2>5. Tu contenido</h2>
      <p>Lo que creas y publicas es tuyo. Los videos que subes se borran de nuestros servidores después de procesarse.</p>
    </LegalPage>
  );
}
