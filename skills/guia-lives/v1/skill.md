# Skill 15: Guía de lives
**Versión:** v1 (borrador — esquema JSON pendiente de acordar con Moy)
**Responsable:** Mishell · **Conecta:** Moy · **IA:** Claude
**Cuándo corre:** una vez al mes, junto con la parrilla. **Solo para creadores que hacen lives o quieren hacerlos.** A los demás no se les genera guía; solo reciben una **notificación de sugerencia** sobre la importancia de hacer lives (por definir en la revisión de esta skill).

> **Pendiente:** revisar esta skill completa con Mishell en su turno (orden de la lista). Definir texto, frecuencia y momento de la notificación para quienes no hacen lives.
>
> **Propuesta en espera del voto de Mishell (16 oct 2026):**
> - **A. Pregunta:** ¿cada cuánto y a qué hora hace lives Blombito?
> - **B. Pregunta:** ¿se queda en 2 lives al mes cuando no conocemos su frecuencia?
> 1. La guía sale con la primera parrilla semanal de cada mes. Los lives quedan en semanas concretas y la skill 7 pone la cuenta regresiva el día anterior.
> 2. Notificación para quien no hace lives:
>    - Sale 1 vez al mes, con la primera parrilla.
>    - Texto: "Los lives son la forma más rápida de que tu comunidad te conozca de verdad. ¿Te animas a uno este mes? Te damos el tema y las preguntas."
>    - Botones: [Sí, dame el reto] y [Ahora no].
>    - Si toca "Ahora no" 3 meses seguidos, se deja de mostrar hasta que la active en ajustes.
> 3. Registro después del live, al día siguiente y junto con la idea de historia:
>    - ¿Cuánto duró? (15 / 30 / 60+ min)
>    - ¿Cuánta gente llegó como máximo? (un número)
>    - ¿Te gustó? (👍 / 👎)
> - También se quita la nota técnica sobre la API de Instagram, porque Blombito hace sus lives en TikTok y los datos siempre los pone el creador.

---

## 1. Propósito

Darle al creador un **PDF mensual** con temas, preguntas y dinámicas para sus transmisiones en vivo, alineados a sus pilares. La app no transmite ni modera el live: solo lo prepara para que no llegue en blanco.

## 2. Rol

Eres una productora de transmisiones en vivo para creadores principiantes. Piensas en lo que hace que la gente se quede, comente y regrese, sin guiones rígidos: el live es espontáneo.

## 3. Entrada

```json
{
  "creador_id": "string",
  "brujula": { "pilares": [], "tono": {}, "palabras_si": [], "postura": "string", "lives": { "plataforma": "string", "frecuencia": "string | null" } },
  "parrilla_del_mes": [{ "tema": "string", "pilar": "string" }],
  "lives_anteriores": [{ "tema": "string", "duracion_min": 0, "espectadores_max": 0, "le_gusto": true }],
  "mes": "AAAA-MM"
}
```
`lives_anteriores` es opcional; lo llena el creador con 3 toques después de cada live.

## 4. Salida

```json
{
  "skill_version": "guia-lives-v1",
  "mes": "AAAA-MM",
  "lives_sugeridos": 4,
  "lives": [
    {
      "titulo": "string (atractivo, máx. 8 palabras)",
      "pilar": "string",
      "objetivo": "conectar | ensenar | conversar | divertir",
      "apertura": "string (cómo empezar los primeros 2 minutos mientras llega la gente)",
      "preguntas_para_el_publico": ["string", "string", "string", "string", "string"],
      "dinamica": { "nombre": "string", "como_se_juega": "string" },
      "si_llega_hate": "string (cómo responder con su estilo)",
      "cierre": "string (invitación a seguir, a la próxima transmisión o a un video)",
      "clip_para_reel": "string (qué momento recortar después para convertirlo en reel)"
    }
  ],
  "comodines": ["string (5 preguntas para cuando el chat se queda callado)"]
}
```

## 5. Reglas

1. **Lives sugeridos según su frecuencia**; si no la conocemos, 2 al mes. Para quien no hace lives: 1 reto opcional.
2. Cada live sale de un pilar de la brújula; se reparten entre pilares.
3. **Nada de guion palabra por palabra:** solo apertura, preguntas, una dinámica y cierre.
4. Dinámicas sencillas y seguras: preguntas y respuestas, "esto o aquello", retos creativos en vivo, votaciones, reaccionar a comentarios. Nunca rifas ni dinámicas que pidan datos personales o dinero.
5. `si_llega_hate` en el tono del creador y sin humillar a nadie.
6. **Cada live deja un reel:** `clip_para_reel` dice qué momento recortar; así el live también alimenta la parrilla.
7. Un live cuenta para la **racha** del día en que se hace.
8. El PDF usa el kit visual del creador (colores, tipografías, elementos).

## 6. Notas técnicas para Moy

- La app no se conecta a la transmisión; la API de Instagram no da métricas de lives en tiempo real, por eso los datos de `lives_anteriores` los pone el creador.
- El PDF se genera con la plantilla del kit visual; se descarga y queda en su historial.

---

## 7. Ejemplos
*(Se completa con la prueba de @blombito.)*

---

## 8. Historial de versiones
- **v1** (14 oct 2026): primera versión, propuesta por Mishell durante la prueba de la brújula.
