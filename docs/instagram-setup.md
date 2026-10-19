# Conectar Instagram (pasos para el administrador)

La app ya trae la conexión oficial (Instagram API con inicio de sesión de Instagram, solo lectura). Falta crear la app en Meta y poner las llaves en Easypanel.

1. Entra a https://developers.facebook.com → **Mis apps** → **Crear app** (tipo "Empresa"/Business). Nombre: Punto de Quiebre.
2. En la app, agrega el producto **Instagram** → **API con inicio de sesión de Instagram** (Instagram API with Instagram Login).
3. En **Configuración de inicio de sesión de empresa de Instagram** agrega:
   - **URI de redireccionamiento OAuth válido:** `https://<tu-dominio>/api/instagram/callback` (exactamente igual a `APP_URL` + `/api/instagram/callback`).
   - **URL de devolución de llamada para desautorizar:** `https://<tu-dominio>/api/instagram/deauthorize`
   - **URL de solicitud de eliminación de datos:** `https://<tu-dominio>/api/instagram/delete`
4. Permisos que se piden: `instagram_business_basic` e `instagram_business_manage_insights` (solo lectura).
5. En **Configuración → Básica** copia el **Id. de la app** y el **Clave secreta**; agrega la URL de la política de privacidad (`/privacidad`) y los términos.
6. En **Roles → Roles** agrega tu cuenta (y la de prueba, p. ej. Blombito) como **Evaluador de Instagram** y acéptalo desde Instagram (Configuración → Apps y sitios web → Invitaciones de evaluador). En modo desarrollo funciona con esas cuentas sin aprobación.
7. Genera la llave de cifrado: `openssl rand -base64 32`.
8. En Easypanel → Environment, en **pdq-app** y **pdq-worker**:
   ```
   META_APP_ID=<id de la app>
   META_APP_SECRET=<clave secreta>
   TOKEN_ENC_KEY=<la llave de cifrado>
   ```
   Si pierdes `TOKEN_ENC_KEY` hay que pedir a los creadores que vuelvan a conectar. Nunca pegues estas llaves en el chat.
9. Deploy de los dos servicios y prueba en **Mi marca → Mi Instagram → Conectar**.
10. Para abrirla a cualquier creador hace falta la **revisión de la app** de Meta: verificación del negocio, política de privacidad, URL para borrar datos, un video por permiso y una cuenta de prueba para el revisor (B1 y B2 del road map).

Cuentas que sí funcionan: profesionales (creador o empresa). Las personales se rechazan con un mensaje claro.
