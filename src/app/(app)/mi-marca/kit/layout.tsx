import type { ReactNode } from "react";

/** Las tipografías del kit se sirven desde el propio servidor; la hoja de estilos solo se carga en estas pantallas. */
export default function KitLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags -- hoja de tipografías alojadas en el propio servidor, solo para estas pantallas */}
      <link rel="stylesheet" href="/fonts/kit/kit-fonts.css" precedence="default" />
      {children}
    </>
  );
}
