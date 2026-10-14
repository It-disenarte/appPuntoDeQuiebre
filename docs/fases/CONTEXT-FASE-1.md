# CONTEXT · Fase 1 — Registro, suscripción, compromiso y panel de clientes

> Documento para la IA que audita vulnerabilidades y errores de esta fase.
> Fecha: 2026-10-14 · Versión de la app: 0.2.0 · Estado: pendiente de aprobación.
> Contexto previo: [CONTEXT-FASE-0.md](CONTEXT-FASE-0.md), que cubre sesiones, CSP con nonce, proxy y límites de inicio de sesión. Todo eso sigue vigente.

## 1. Alcance

- **Registro público** con nombre, correo, contraseña, fecha de nacimiento (18+), aceptación versionada de términos y aviso de privacidad, y un código opcional.
- **Suscripción con Stripe** (Checkout alojado + portal de cliente). Planes Básico y Pro en MXN; los precios se definen en Stripe.
  - Con código de prueba: 30 días gratis, la tarjeta se registra igual y el cobro es automático al terminar.
  - Sin código: se paga desde el día 1.
- **Códigos promocionales propios** de dos tipos: prueba gratis o descuento (este último crea un cupón en Stripe). Tienen plan, usos máximos, vigencia y campaña, y registran usos y conversión a pago.
- **Estados de acceso:** la suscripción se sincroniza por webhooks. Un cobro fallido abre un **periodo de gracia de 7 días** (configurable) con aviso, y después la **sesión queda suspendida** (sin acceso a la app; solo a `/suscripcion` para pagar).
- **Presentación y compromiso:** video de Erick, 5 pantallas, 4 preguntas de comprensión y "Acepto el compromiso", con fecha y versión.
- **Solicitud de factura (CFDI 4.0)** por cada pago. La emite cuentas por cobrar de Diseñarte, fuera de la app.
- **Panel de administrador:**
  - Clientes: búsqueda y filtros, ficha, restablecer contraseña, desactivar o reactivar, cerrar sesiones.
  - Suscripciones, códigos y facturas.
  - Ajustes: subida del video de bienvenida y alta de admins.
- **MinIO** para el video de bienvenida: privado, sin dominio público; subida y reproducción a través de la app.

**Fuera de alcance:** correos propios (Stripe envía recibos y avisos de cobro fallido), métricas del negocio (Fase 7), textos legales definitivos (los entrega el abogado) y cualquier función de las fases 2 en adelante.

## 2. Archivos nuevos o modificados

| Ruta | Rol |
| --- | --- |
| `src/lib/db/schema.ts` · `drizzle/0001_fase1_billing.sql` | Tablas nuevas (ver §3) y columnas nuevas en `users` |
| `src/lib/billing/stripe.ts` | Único punto de contacto con el SDK de Stripe (v23, API `2026-09-30.endive`) |
| `src/lib/billing/service.ts` | Checkout, portal, reserva de códigos, sincronización, webhooks, precios |
| `src/lib/billing/access.ts` | Función pura: suscripción → estado de acceso (incluye la gracia) |
| `src/lib/billing/map.ts` | Función pura: suscripción de Stripe → fila nuestra; protección contra eventos fuera de orden |
| `src/lib/billing/promo.ts` | Validación pura de códigos |
| `src/lib/billing/labels.ts` | Textos para el usuario |
| `src/lib/auth/gates.ts` | `requireCreatorAccess` (pago + compromiso) y `requirePaidUser` |
| `src/lib/auth/dal.ts` | Nuevos `getApiUser()` e `isSameOrigin()` para Route Handlers |
| `src/lib/account/actions.ts` | Server Actions del creador: registro, checkout, portal, compromiso, factura |
| `src/lib/admin/actions.ts` · `src/lib/admin/queries.ts` | Acciones y consultas del panel |
| `src/lib/rate.ts` | Limitador genérico atómico (`pg_advisory_xact_lock` + conteo + inserción) |
| `src/lib/storage.ts` · `src/lib/settings.ts` | MinIO (S3, `forcePathStyle`) y ajustes en BD |
| `src/lib/validation.ts` · `src/lib/legal.ts` · `src/lib/commitment.ts` · `src/lib/plans.ts` | Edad en hora de México, RFC, catálogos SAT, versión de términos, contenido del compromiso, planes |
| `src/app/api/stripe/webhook/route.ts` | Webhook (público, firmado) |
| `src/app/api/admin/media/bienvenida/route.ts` | Subida del video (solo admin, **excluida del proxy**) |
| `src/app/api/media/bienvenida/route.ts` | Reproducción con Range (con sesión) |
| `src/app/(auth)/registro`, `src/app/(cuenta)/{suscripcion,suscripcion/exito,bienvenida}`, `src/app/(app)/mi-marca/factura`, `src/app/{terminos,privacidad}` | Pantallas |
| `src/app/admin/{clientes,clientes/[id],suscripciones,codigos,facturas,ajustes}` | Panel |
| `src/proxy.ts` | Rutas públicas nuevas, `form-action` con Stripe y exclusión de `api/admin/media/` |
| `src/worker/index.ts` | Trabajo cada hora para liberar reservas de códigos y purga de `rate_events` |
| `src/components/ui/index.tsx` | Controles nuevos; `cn` usa tailwind-merge |

## 3. Modelo de datos (nuevo)

- `users` + `birth_date`, `terms_version`, `terms_accepted_at`, `billing_customer_id` (único).
- `subscriptions`: **una por usuario** (índice único en `user_id`), `provider_subscription_id` (único), `plan`, `status` (el texto de Stripe), `trial_end`, `current_period_end`, `cancel_at_period_end` y `past_due_since` (inicio de la gracia).
- `promo_codes`: `code` (único, en mayúsculas), `kind` (trial/discount), `plan` (nulo = cualquiera), `trial_days`, `percent_off`, `duration_months`, `max_uses`, `uses`, vigencia, `campaign`, `active` y `provider_coupon_id`. **Restricciones CHECK** en la BD:
  - días de prueba entre 1 y 90;
  - porcentaje entre 1 y 100;
  - `uses >= 0 and (max_uses is null or uses <= max_uses)`.
- `promo_redemptions`: estado `reserved | completed | released`, `checkout_id` (único) y `converted_at` (primer cobro mayor a 0).
- `payments`: facturas pagadas en Stripe (`provider_invoice_id` único).
- `invoice_requests`: datos del CFDI, estado `pendiente | emitida | rechazada` y `payment_id` (único: una solicitud por pago).
- `commitments` (PK `user_id`), `billing_events` (idempotencia de webhooks), `app_settings` y `rate_events`.

## 4. Rutas y autorización

| Ruta | Acceso | Control |
| --- | --- | --- |
| `/registro`, `/terminos`, `/privacidad` | público | — |
| `/suscripcion`, `/suscripcion/exito` | con sesión (creador) | `requireUser`; un admin es redirigido a `/admin` |
| `/bienvenida` | con sesión + acceso pagado | `requirePaidUser` |
| `/hoy` `/semana` `/grabar` `/progreso` `/mi-marca` `/mi-marca/factura` | pago (trialing/active/grace) + compromiso | `requireCreatorAccess` en el layout **y** en cada página. Los admins pasan (vista previa) |
| `/admin/**` | admin | `requireAdmin` en el layout y en cada página/acción; 404 si no es admin |
| `POST /api/stripe/webhook` | público | firma `Stripe-Signature` (`constructEvent`); cuerpo de máximo 1 MB |
| `POST /api/admin/media/bienvenida` | admin | `isSameOrigin` (CSRF) + `getApiUser` + rol. Tipos MP4/WebM/MOV, `Content-Length` obligatorio y conteo real de bytes (máximo 500 MB). Fuera del matcher del proxy |
| `GET /api/media/bienvenida` | con sesión | `getApiUser`; Range con formato estricto `bytes=N-M` |

**Estados de acceso** (`computeAccess`):

| Estado | Condición | ¿Entra a la app? |
| --- | --- | --- |
| `trialing` / `active` | prueba o pago al día | sí |
| `grace` | `past_due`/`unpaid` desde hace ≤ `BILLING_GRACE_DAYS` | sí, con aviso |
| `suspended` | `past_due`/`unpaid` desde hace más de la gracia, o `paused` | no |
| `pending` | `incomplete` | no |
| `none` | sin fila, `canceled`, `incomplete_expired` u otro estado | no |

## 5. Flujos sensibles

**Registro (`registerAction`)**
1. Validación zod: nombre de 2 a 80, correo, fecha de nacimiento AAAA-MM-DD válida, casilla de términos y código opcional.
2. Edad calculada **en hora de México**: menos de 18 se rechaza; más de 110 cuenta como fecha inválida.
3. Política de contraseña y confirmación.
4. Límite de **5 registros por IP por hora** (atómico).
5. Hash argon2id, inserción, sesión nueva y bitácora `auth.registered` con la versión de términos.
6. Redirige a `/suscripcion?codigo=…` (el código ya normalizado).

Un correo duplicado devuelve "Ya existe una cuenta con ese correo". Ver §8.

**Checkout (`startCheckout`)**
1. Si ya hay una suscripción viva (cualquier estado distinto de `none`), no deja crear otra.
2. Libera las reservas de código pendientes del usuario y expira esas sesiones de Stripe.
3. **Reserva atómica del código:** en una transacción con `SELECT … FOR UPDATE` sobre el código, valida (activo, vigencia, usos, plan, prueba una sola vez por cuenta), suma `uses + 1` e inserta la redención `reserved`. La restricción CHECK de la BD impide superar `max_uses` aunque falle la lógica.
4. Crea el cliente de Stripe con **clave de idempotencia** `pdq-customer-<userId>`.
5. Crea la sesión de Checkout:
   - `mode: subscription` y `payment_method_collection: always`;
   - `trial_period_days` (con `missing_payment_method: cancel`) o `discounts: [{coupon}]`;
   - expira en 31 minutos;
   - `client_reference_id` y metadatos con el `userId`.
6. Si falla la creación, la reserva se libera.
7. Límite de 10 checkouts por usuario por hora.

**Regreso del pago (`confirmCheckout`):** valida el formato `cs_(test|live)_…`, que `client_reference_id === userId` y que `status === complete`. Después completa la redención y sincroniza la suscripción. Así el usuario no depende de que el webhook llegue primero.

**Webhook (`handleWebhook`)**
1. `constructEvent` con `STRIPE_WEBHOOK_SECRET`; si la firma es inválida responde 400.
2. `INSERT … ON CONFLICT DO NOTHING` en `billing_events`. Si el evento ya estaba **procesado**, responde "duplicado"; si quedó a medias, lo reprocesa.
3. Eventos:

| Evento | Acción |
| --- | --- |
| `checkout.session.completed` | completa la redención y sincroniza la suscripción |
| `checkout.session.expired` | libera la reserva y devuelve el uso al código |
| `customer.subscription.*` | sincroniza la suscripción |
| `invoice.paid` | registra el pago si es mayor a 0, marca la conversión del código y sincroniza |
| `invoice.payment_failed` | sincroniza |

4. Ante un error responde 500 para que Stripe reintente.

**Sincronización (`syncSubscription`)**
- **Siempre vuelve a consultar la suscripción a Stripe**, en lugar de confiar en el objeto del evento; así los eventos desordenados no dejan datos viejos.
- Busca al usuario por `billing_customer_id`. Si el precio no es de nuestros planes, ignora la suscripción.
- Dentro de una transacción con candado por usuario aplica `shouldOverwrite`: un `canceled` de una suscripción **vieja** no pisa una vigente.
- `past_due_since` se conserva mientras dure la mora y se borra al regularizarse.
- Registra `billing.status_changed` en la bitácora.

**Compromiso:** el servidor valida las respuestas (al cliente nunca se mandan las correctas, solo pistas de las incorrectas), exige la casilla, inserta con `ON CONFLICT DO NOTHING` y registra en la bitácora.

**Factura:** RFC con expresión regular (persona física o moral, en mayúsculas), régimen y uso del CFDI de una lista cerrada, CP de 5 dígitos y correo. El `paymentId` **debe pertenecer al usuario**. Una solicitud por pago (índice único) y máximo 10 por día.

**Acciones de admin:**
- Cada una ejecuta `requireAdmin()` y registra en la bitácora.
- Restablecer contraseña: genera una temporal, cierra **todas** las sesiones y la muestra **una vez** en la respuesta de la acción; no se guarda en claro.
- Ningún admin puede actuar sobre su propia cuenta (desactivar, restablecer, cerrar sesiones).
- Las fechas de vigencia de los códigos se interpretan en hora de México (UTC−6).
- La búsqueda escapa los comodines de LIKE.

## 6. Configuración nueva

`STRIPE_SECRET_KEY` (`sk_test_`/`sk_live_`), `STRIPE_WEBHOOK_SECRET` (`whsec_`), `STRIPE_PRICE_BASICO` / `STRIPE_PRICE_PRO` (`price_`), `BILLING_GRACE_DAYS` (7), y `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY`. Todas son opcionales al arrancar: sin Stripe, la pantalla de planes dice que los pagos no están disponibles; sin MinIO, el panel no permite subir el video.

Configuración que vive en el panel de Stripe (no en el código): portal de cliente, reintentos inteligentes, qué pasa al agotarse los reintentos y correos al cliente. Está documentada en el README.

## 7. Controles de seguridad de esta fase

Datos de tarjeta solo en Stripe · webhook firmado e idempotente · sincronización que consulta a Stripe (no confía en el evento) · candados por usuario y por código · CHECK en la BD para usos máximos · una suscripción por usuario (índice único) · prueba gratis una sola vez por cuenta · verificación de propiedad de la sesión de Checkout al regresar · límites de frecuencia en registro, checkout y facturas · verificación de origen (CSRF) en la subida · MinIO privado detrás de la app · Range validado · respuestas correctas del compromiso solo en el servidor · contraseñas temporales mostradas una vez · bitácora de todas las acciones de admin y de los cambios de suscripción.

## 8. Riesgos conocidos y decisiones conscientes

1. **El registro revela si un correo ya existe.** Es una decisión de usabilidad y lo frena el límite de 5 por IP por hora.
2. **Abuso de la prueba gratis con cuentas nuevas:** la prueba es una por cuenta, no por persona ni por tarjeta. Se puede mitigar después con la huella de la tarjeta (`card.fingerprint`) de Stripe.
3. **Usos máximos:** un uso se reserva al abrir el checkout y se libera al expirar (webhook o, como respaldo, el worker cada hora a las 2 h). Mientras dure la reserva, el código puede parecer agotado.
4. **Un usuario suspendido no puede pedir facturas** (`/mi-marca/factura` exige acceso). Si hace falta, se agrega una excepción.
5. **Desactivar una cuenta no cancela la suscripción en Stripe.** Se avisa en el panel.
6. **La subida del video está fuera del proxy:** no lleva la CSP del proxy (responde JSON) y toda la validación vive en la ruta.
7. **`confirmCheckout` llama a Stripe durante el render** de `/suscripcion/exito`. Hay un límite de frecuencia indirecto (hay que estar autenticado), pero no uno explícito.
8. **El estado `incomplete`** (pago con 3-D Secure pendiente) se muestra como "Pago en proceso" y solo deja abrir el portal.
9. **Los catálogos SAT están reducidos** a los regímenes y usos más comunes.
10. **Los admins entran a la app de creador sin suscripción** (vista previa) y no pueden suscribirse.
11. **Prueba real con Stripe:** este documento se escribió **antes** de probar contra la cuenta de prueba de Stripe (faltan las llaves). Lo verificado son la lógica pura, las restricciones de la BD y los flujos con suscripciones insertadas directamente. Ver §10.

## 9. Qué conviene revisar en la auditoría

- Que **ninguna** ruta de `(app)` sea accesible sin pago y compromiso: el layout y **cada** página llaman a `requireCreatorAccess`.
- Carreras en códigos: dos checkouts simultáneos con el último uso disponible.
- Idempotencia del webhook ante reintentos y entregas concurrentes; webhook con firma de otra cuenta; evento de otro cliente.
- `confirmCheckout` con un `session_id` de otro usuario.
- Que una suscripción vieja cancelada no pise la nueva (`shouldOverwrite`).
- Subida del video: `Content-Length` falso, cuerpo mayor al declarado, `Content-Type` falsificado, petición sin `Origin`.
- Range: `bytes=0-` en archivos grandes, rangos inválidos.
- Acciones de admin invocadas por un creador (deben fallar con 404).
- Inyección en la búsqueda de clientes (`%`, `_`, `\`).
- Fugas de datos: que la ficha de cliente solo la vea un admin y que `/mi-marca/factura` solo muestre pagos propios.

## 10. Cómo probar

```bash
npm test          # 40 pruebas: acceso y gracia, códigos, traducción de suscripciones,
                  # eventos fuera de orden, edad, RFC, compromiso, CHECK de la BD, cn
npm run typecheck && npm run lint && npm run build
```

Recorrido de punta a punta ya hecho (Edge + PGlite, sin Stripe, con suscripciones insertadas):
- registro de menor de edad rechazado;
- código precargado desde `?codigo=`;
- sin pago → `/suscripcion`; prueba sin compromiso → `/bienvenida`;
- respuesta incorrecta marcada, conservando las correctas; aceptado → `/hoy`;
- gracia: aviso con la fecha límite correcta; gracia vencida → `/suscripcion` suspendida;
- correo duplicado (en mayúsculas) rechazado;
- solicitud de factura (RFC normalizado a mayúsculas) → el admin la marca emitida;
- búsqueda con `%` tratada de forma literal; restablecer contraseña → la temporal aparece una vez y la sesión del cliente se cierra;
- código duplicado rechazado;
- ninguna pantalla nueva se desborda a 360 px.

**Pendiente con las llaves de prueba de Stripe:**
- checkout real con y sin código;
- webhook con la CLI de Stripe o un endpoint público;
- cobro fallido con la tarjeta `4000 0000 0000 0341`;
- portal de cliente y cambio de plan;
- cupón de descuento.
