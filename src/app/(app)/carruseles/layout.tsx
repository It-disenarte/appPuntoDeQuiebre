import type { ReactNode } from "react";
import { KIT_FONTS_CSS } from "@/lib/kit/fonts";

// Las tipografías del kit se sirven desde nuestro servidor (no desde Google) para que la vista previa y los PNG salgan iguales.
export default function CarruselesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href={KIT_FONTS_CSS} precedence="default" />
      {children}
    </>
  );
}
