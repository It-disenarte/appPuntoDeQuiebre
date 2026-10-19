# Roadmap de la app Punto de Quiebre

Documento vivo: todo lo que hace la app, para el creador y para el administrador, con su estado real y cómo verificarlo.

**Estados:** ✅ construido y verificado · 🟡 construido, falta verificar en el VPS o con datos reales · 🧪 construido con respuestas de prueba (sin IA o sin servicio externo) · ⬜ pendiente · ⛔ bloqueado por algo externo (ver "Bloqueos").

> Última actualización: 2026-10-17 (Fase 6 construida).

## Bloqueos externos (lo que necesito de ti, de Mishell o de Moy)

| # | Qué falta | Quién | Bloquea |
| --- | --- | --- | --- |
| B1 | App de Meta (Instagram) en modo desarrollo: `META_APP_ID`, `META_APP_SECRET`, URL de retorno configurada y una cuenta de prueba (p. ej. Blombito) | Tú / Mishell | Conexión de Instagram, auditoría, métricas, publicar |
| B2 | Verificación del negocio en Meta, política de privacidad y URL para borrar datos (para usuarios reales) | Erick / Tú | Abrir Instagram a usuarios externos |
| B3 | **Código del analizador de competencia** (de Moy) y `APIFY_TOKEN` | Moy / Tú | Fase 5 y "lo probado" de la parrilla |
| B4 | Skills que no se han entregado: guiones, métricas (9), reglas de aprendizaje (10), coach de video (11), tendencias (12), edición automática (13), frases motivacionales | Mishell | Esas funciones con IA real (mientras tanto, borrador mío marcado como tal) |
| B5 | Plantillas de carruseles y de Remotion; enlaces de Discord, WhatsApp y sesión en vivo | Equipo MKT | Carruseles finales, edición Pro, comunidad |
| B6 | Textos legales definitivos (términos y privacidad) | Abogado | Lanzamiento |
| B7 | Empresa constituida para Stripe real | Erick | Cobros reales |

## A. Lo que hace el creador

| # | Función | Fase | Estado | Cómo verificarla |
| --- | --- | --- | --- | --- |
| A1 | Registrarse (mayor de 18, términos), iniciar sesión, cambiar contraseña; sin recuperación (la pide a un admin) | 0–1 | ✅ | Registrar una cuenta; probar menor de edad, contraseña débil, correo repetido |
| A2 | Suscribirse con Stripe (plan Básico o Pro), código de prueba gratis o descuento | 1 | ✅ | Pagar con `4242…` con y sin código |
| A3 | Cobro fallido: gracia de 7 días y luego sesión suspendida | 1 | 🟡 (solo pruebas de lógica) | Forzar `past_due` desde el Shell de Stripe |
| A4 | Portal de Stripe: cambiar tarjeta, plan o cancelar; solicitar factura | 1 | 🟡 | "Gestionar pago"; pedir factura |
| A5 | Presentación y compromiso (video de Erick, 4 preguntas) | 1 | ✅ | Subir el video desde Ajustes y aceptarlo |
| A6 | Tu historia: 7 preguntas por voz o texto (mínimos, repregunta, saltar) | 2A | ✅ | Responder con voz real en iPhone y Android |
| A7 | Brújula de marca con IA, calificada por 5 secciones (👍 ✏️ 👎) y PDF | 2A | ✅ | Generar, ajustar y descargar el PDF |
| A8 | Perfil de voz | 2A | ✅ | Revisar que suene a la persona |
| A9 | Horario de grabación (2 fijos + 1 de respaldo, consejos de luz, recordatorios) | 2A | ✅ | Responder con distintos días y luces |
| A10 | Kit visual: 5 rondas + revelación con sus fotos | 2B | 🧪 / 🟡 | Subir fotos reales (MinIO + sharp) y correr con IA real |
| A11 | Conectar Instagram (inicio de sesión oficial, desconectar cuando quiera) y guía de cuenta profesional | 3 | 🟡 ⛔B1 | Código listo y probado con API simulada; falta crear la app de Meta (docs/instagram-setup.md) y probar con una cuenta evaluadora |
| A12 | Auditoría de su cuenta y tarjetas "Así te vemos" | 3 | 🟡 ⛔B1 | Código listo (modo sin contenido con menos de 9 publicaciones); falta probar con una cuenta real. No analiza miniaturas ni colores todavía |
| A13 | Optimización de perfil (capturas → nombre, bio por red, destacadas) y calificador de foto | 4 | ⬜ | — |
| A14 | Analizador de competencia (1 vez cada 7 días, con contador) | 5 | 🧪 | Con APIFY_TOKEN y Gemini: correr sobre 2 cuentas reales; sin llaves corre con ejemplos |
| A15 | Parrilla semanal (4 videos + 3 carruseles en Básico; 5 + 2 en Pro) con categoría, probado/prueba y tarjeta de prueba | 6 | 🧪 | Generar la semana en Básico y en Pro; revisar mezcla y variante |
| A16 | Guion completo y textos distintos por red (Instagram, TikTok, Facebook) con 3 ganchos | 6 | 🧪 | Abrir una pieza, escribir textos, elegir gancho, 👍 ✏️, copiar |
| A17 | Idea de historia diaria (otra idea, voto, idea propia) | 6 | 🧪 | Usar las 7 tarjetas de la semana y la de Hoy |
| A18 | Grabar: teleprompter, grabación por partes (gancho, cuerpo, cierre), repetir una parte, guía de encuadre | 7 | 🧪 | Probar en iPhone y Android: permisos, teleprompter, repetir parte, reproducir lo subido |
| A19 | Subir con aviso de WiFi, compresión y cola con reintentos | 7 | 🧪 | Subir con WiFi, con datos móviles (Android avisa; iPhone no informa el tipo de red) y cortando el internet a media subida ; video completo con ffmpeg en el worker (probar con partes reales) |
| A20 | Carruseles: texto por diapositiva en plantillas con su kit, edición propia y exportar PNG | 8 | 🧪 | Estático (PNG 1080×1350) listo; animado (MP4) pendiente. Probar vista previa y exportación en iPhone/Android ; Animado gris en Básico con invitación a Pro; “Lo quiero en Canva” baja un PPTX editable (aproximación) |
| A21 | Publicar y programar en Instagram; descargar y copiar para TikTok y Facebook | 9 | ⬜ ⛔B1 | — |
| A22 | Racha automática, modo pausa (hasta 7 días), recordatorios por notificación, frases motivacionales | 10 | 🧪 | Falta VAPID en Easypanel; racha por API y frases motivacionales siguen ⬜ |
| A23 | Comunidad: sesión en vivo, Discord, WhatsApp | 10 | ⬜ ⛔B5 | — |
| A24 | Progreso: métricas en lenguaje sencillo, comparadas contra sí mismo, hallazgos como hipótesis | 11 | 🧪 | Por capturas mensuales (sin API de Meta); probar con capturas reales |
| A25 | Coach de video, tendencias, edición automática (solo Pro) | V2 | ⬜ ⛔B4 ⛔B5 | — |
| A26 | Instalar como app en el teléfono (PWA), modo sin conexión básico | 0 | ✅ | Instalar en iPhone y Android |

## B. Lo que hace el administrador

| # | Función | Fase | Estado | Cómo verificarla |
| --- | --- | --- | --- | --- |
| M1 | Iniciar sesión; crear otros administradores | 0–1 | ✅ | Crear un admin y entrar con él |
| M2 | Lista de clientes con búsqueda y filtros; ficha del cliente | 1 | ✅ | Buscar con `%` y `_` |
| M3 | Restablecer contraseña, cerrar sesiones, desactivar o reactivar una cuenta | 1 | ✅ | Probar cada acción |
| M4 | Suscripciones (plan, estado, renovación) y enlace a Stripe | 1 | ✅ | Revisar tras un pago |
| M5 | Códigos de mes gratis o descuento (planes, usos, vigencia) y conversión | 1 | ✅ | Crear uno con fechas y usarlo |
| M6 | Solicitudes de factura: marcar emitida o rechazar | 1 | ✅ | Pedir una desde un creador |
| M7 | Video de bienvenida | 1 | ✅ | Subir y reproducir |
| M8 | Ficha con fase actual, avance del alta, racha y última actividad | 2–10 | 🧪 | Abrir la ficha de un creador: fase, avance, racha y última actividad (la racha es por semanas con grabación o pieza hecha; la automática por API llega con Instagram) |
| M9 | Uso de límites y **costo de IA contra ingreso** por cliente | 7 | 🧪 | Ficha del cliente y /admin/metricas; el costo es ESTIMADO con precios editables |
| M10 | Límites configurables sin tocar código (coach, ediciones, analizador) | 7 | 🧪 | /admin/limites: el intervalo y los videos del analizador ya se aplican; coach, ediciones y tendencias quedan guardados para cuando existan |
| M11 | Métricas del negocio: tiempo por fase, % que termina cada fase, conversión de prueba a pago, permanencia al mes 2 y 3 | 7 | 🧪 | /admin/metricas con datos reales de clientes |
| M12 | Alertas de abandono: rachas rotas y usuarios inactivos | 7 | 🧪 | /admin/alertas; no envía correos ni avisos, solo lista ; /admin/errores: errores del sistema con contador y aviso en el resumen y el menú |
| M13 | Bitácora de auditoría | 0 | ✅ | Revisar tras acciones |

## C. Piezas técnicas transversales

| # | Pieza | Estado |
| --- | --- | --- |
| T1 | Worker (pg-boss): limpieza diaria y liberación de reservas | ✅ |
| T2 | Skills de IA versionadas con Claude; transcripción con Gemini | ✅ (probadas en el VPS) |
| T3 | Notificaciones Web Push (VAPID) y recordatorios | 🧪 |
| T4 | Respaldo de la base de datos | ⬜ (lo activas en Easypanel) |
| T5 | Cifrado de tokens de Instagram | ✅ (AES-256-GCM, `TOKEN_ENC_KEY`) |
| T6 | Registro de costo de IA en pesos | ⬜ (hoy se guardan tokens) |
