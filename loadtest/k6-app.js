// Prueba de carga de Punto de Quiebre con k6 (https://k6.io). Simula creadores con sesión navegando la app SIN llamar a la IA.
//
//   k6 run -e BASE_URL=http://localhost:3000 -e SECRETO=la-clave-del-sembrador -e USUARIOS=50 loadtest/k6-app.js
//
// Variables: BASE_URL, SECRETO (la misma --secreto con que se sembraron las cuentas) y USUARIOS (cuántas se sembraron): obligatorias
//            · PICO = usuarios simultáneos máximos (25) · RAPIDA=1 para una prueba corta de humo (1 minuto)
//            · COOKIE = nombre de la cookie (por defecto, según http/https) · PERMITIR_PRODUCCION=1 (solo si de verdad es producción)
import { check, group, sleep } from "k6";
import crypto from "k6/crypto";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

const BASE = (__ENV.BASE_URL || "").replace(/\/$/, "");
if (!BASE) throw new Error("Falta -e BASE_URL=https://… (a dónde apuntar la carga).");
if (/app\.puntodequiebre\.pro|easypanel\.host/.test(BASE) && !__ENV.PERMITIR_PRODUCCION) {
  throw new Error("Esa dirección parece PRODUCCIÓN. Usa una copia de prueba, o agrega -e PERMITIR_PRODUCCION=1 si de verdad quieres cargarla.");
}

const SECRETO = __ENV.SECRETO || "";
const USUARIOS = Number(__ENV.USUARIOS || 0);
if (SECRETO.length < 16 || !USUARIOS) throw new Error("Faltan -e SECRETO=<la clave con que sembraste> y -e USUARIOS=<cuántas cuentas sembraste>.");
// El mismo cálculo que loadtest/seed.ts (tokenFor): HMAC-SHA256(clave, "carga-N") en base64url.
const tokenFor = (n) => crypto.hmac("sha256", SECRETO, `carga-${n}`, "base64rawurl");
const COOKIE = __ENV.COOKIE || (BASE.startsWith("https") ? "__Host-pdq_session" : "pdq_session");
const PICO = Number(__ENV.PICO || 25);

// Cada ruta con su peso (qué tan seguido la abre la gente). Hoy y Semana son las pantallas del día a día.
const PAGES = [
  { name: "hoy", path: "/hoy", w: 10 },
  { name: "semana", path: "/semana", w: 6 },
  { name: "carruseles", path: "/carruseles", w: 3 },
  { name: "progreso", path: "/progreso", w: 3 },
  { name: "mi-marca", path: "/mi-marca", w: 3 },
  { name: "grabar", path: "/grabar", w: 3 },
  { name: "tendencias", path: "/tendencias", w: 2 },
  { name: "directos", path: "/directos", w: 2 },
  { name: "analizador", path: "/analizador", w: 2 },
  { name: "metricas", path: "/progreso/metricas", w: 1 },
  { name: "manual", path: "/mi-marca/manual", w: 1 },
  { name: "kit", path: "/mi-marca/kit", w: 1 },
  { name: "horario", path: "/mi-marca/horario", w: 1 },
];
const pool = PAGES.flatMap((p) => Array(p.w).fill(p));

const accesoBloqueado = new Rate("acceso_bloqueado"); // la sesión no sirvió: la mandaron a login, suscripción o bienvenida
const pagina = new Trend("pagina_ms", true);

const stages = __ENV.RAPIDA
  ? [{ duration: "20s", target: Math.max(2, Math.round(PICO / 2)) }, { duration: "30s", target: PICO }, { duration: "10s", target: 0 }]
  : [
      { duration: "1m", target: Math.max(2, Math.round(PICO / 4)) },
      { duration: "2m", target: Math.max(2, Math.round(PICO / 2)) },
      { duration: "2m", target: PICO },
      { duration: "3m", target: PICO }, // sostenido: aquí se nota si algo se va llenando poco a poco (memoria, conexiones)
      { duration: "30s", target: 0 },
    ];

// Un umbral por pantalla (95 % en menos de 3 s): así el resumen muestra el tiempo de CADA una y cuál es la que se rompe primero.
const porPantalla = Object.fromEntries(PAGES.map((p) => [`http_req_duration{pagina:${p.name}}`, ["p(95)<3000"]]));

export const options = {
  scenarios: {
    creadores: { executor: "ramping-vus", startVUs: 1, stages, gracefulRampDown: "15s", exec: "creador" },
    visitantes: { executor: "constant-vus", vus: 2, duration: __ENV.RAPIDA ? "1m" : "10m", exec: "visitante" },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"], // menos de 1 % de errores
    acceso_bloqueado: ["rate<0.001"], // las cuentas de prueba deben entrar siempre
    "http_req_duration{kind:pagina}": ["p(95)<2000"], // 95 % de las pantallas en menos de 2 s
    ...porPantalla,
  },
};

export function creador() {
  const jar = http.cookieJar();
  jar.set(BASE, COOKIE, tokenFor(((__VU - 1) % USUARIOS) + 1), { path: "/", secure: BASE.startsWith("https"), httpOnly: true });

  // Una visita: 3 a 6 pantallas con pausas de lectura entre una y otra.
  const visitas = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < visitas; i++) {
    const p = pool[Math.floor(Math.random() * pool.length)];
    group(p.name, () => {
      const res = http.get(`${BASE}${p.path}`, { tags: { kind: "pagina", pagina: p.name } });
      pagina.add(res.timings.duration, { pagina: p.name });
      const bloqueado = /\/(login|suscripcion|bienvenida)(\?|$)/.test(res.url);
      accesoBloqueado.add(bloqueado);
      check(res, { "responde 200": (r) => r.status === 200 && !bloqueado });
    });
    sleep(2 + Math.random() * 4);
  }
}

export function visitante() {
  group("login", () => {
    const res = http.get(`${BASE}/login`, { tags: { kind: "publica" } });
    check(res, { "login 200": (r) => r.status === 200 });
  });
  group("health", () => {
    const res = http.get(`${BASE}/api/health`, { tags: { kind: "publica" } });
    check(res, { "health 200": (r) => r.status === 200 });
  });
  sleep(3);
}
