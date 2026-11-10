# Prueba de carga

Simula creadores con sesión navegando la app (Hoy, Semana, Carruseles, Progreso, Mi marca…) para ver **dónde se rompe** y cuántas personas aguanta el servidor. Usa [k6](https://k6.io) (de Grafana).

## Lo que NO hace
- **No llama a la IA** (cuesta dinero). Solo abre pantallas, que es donde se mide el servidor y la base de datos.
- **No prueba el inicio de sesión.** Las sesiones se siembran ya hechas. El inicio de sesión (argon2) es lento a propósito y conviene medirlo aparte.
- **Las cuentas sembradas están vacías** (sin brújula ni semana). Las pantallas con datos reales pesan algo más, así que tómalo como un piso, no como el límite exacto.
- **No sube videos ni genera carruseles animados.** El worker (ffmpeg) se prueba aparte.

## ⚠️ Nunca contra producción
Usa una **copia de pruebas** en Easypanel: una app aparte con su propia base de datos. El sembrador se niega a correr si el entorno no tiene `ALLOW_LOADTEST_SEED=1`; **ponlo solo en la copia, jamás en `pdq-app` de producción**. El guion de k6 también se niega a apuntar a la dirección de producción.

## Preparar la copia de pruebas (una vez)
1. En Easypanel, duplica `pdq-app` y `pdq-db` con otros nombres (por ejemplo `pdq-app-prueba`, `pdq-db-prueba`).
2. En la copia: `DATABASE_URL` hacia la base de prueba, `APP_URL` con su propio dominio, y **`ALLOW_LOADTEST_SEED=1`**. Sin llaves de IA.
3. Despliega y abre su consola.

## Cada prueba
**1. Sembrar cuentas** (en la consola de la copia de pruebas):
```
node dist/seed-carga.mjs --users 100 --secreto UNA-CLAVE-LARGA-INVENTADA --confirmo-que-no-es-produccion
```
Crea 100 cuentas (mitad Básico, mitad Pro). Siempre borra antes las `@carga.test` anteriores.

**2. Instalar k6** en tu PC (una vez): `winget install GrafanaLabs.k6`

**3. Correr** (en tu PC, desde la carpeta del proyecto):
```
k6 run -e BASE_URL=https://TU-COPIA-DE-PRUEBAS -e SECRETO=UNA-CLAVE-LARGA-INVENTADA -e USUARIOS=100 -e PICO=25 loadtest/k6-app.js
```
- `PICO` = personas simultáneas máximas. **Sube por escalones: 10, 25, 50, 100.** No saltes a 100.
- `RAPIDA=1` hace una prueba de humo de 1 minuto. Úsala primero para confirmar que todo conecta.
- Una prueba normal dura unos 9 minutos (sube, sostiene y baja).

**4. Mientras corre**, abre Easypanel → la copia de pruebas → gráficas de **CPU y memoria** de la app y de la base. Anota el pico.

**5. Limpiar** al terminar: `node dist/seed-carga.mjs --limpiar --confirmo-que-no-es-produccion`

## Cómo leer el resultado
Al final k6 marca cada umbral con ✓ o ✗:
- `http_req_failed` < 1 %: casi no hay errores.
- `acceso_bloqueado` ~ 0 %: las cuentas de prueba entran. **Si sale alto, la clave o el número de usuarios no coinciden** con los del sembrador, o ese entorno no es el que sembraste.
- `p(95)` por pantalla < 3 s: el 95 % de las veces cada pantalla responde en menos de 3 segundos. El resumen trae una línea por pantalla, así sabes cuál se degrada primero.

**El límite real es el escalón donde empieza a aparecer ✗** (tiempos que se disparan o errores). Anótalo junto con el CPU y la memoria de ese momento: dice si falta máquina, conexiones a la base (`DATABASE_POOL_MAX`) o hay una pantalla lenta que arreglar.

## Qué probar después
- **Carga sostenida:** deja el escalón del límite 15 minutos. Si los tiempos empeoran poco a poco, hay algo que se acumula (memoria, conexiones).
- **El worker:** pide varios carruseles animados a la vez desde cuentas Pro y mira cuánto tarda la cola (en la copia de pruebas, con IA sin llaves).
- **El inicio de sesión:** 20 personas entrando a la vez mide el costo de argon2 en tu VPS.
