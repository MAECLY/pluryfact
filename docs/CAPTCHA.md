# reCAPTCHA en Comprobantes recibidos

**Estado:** Legajo no incluye resolución ni evasión automática de captchas. El objetivo de UX es que el usuario **no vea nunca un captcha**, y se logra reduciendo el número de consultas, no burlando el control.

## Qué hay

- Solo la pantalla de **recibidos** lo usa. Emitidos no tiene captcha.
- reCAPTCHA **Enterprise invisible** (site key `6LdukTQsAAAAAIcciM4GZq4ibeyplUhmWvlScuQE`, acción `consulta_cel_recibidos`). El botón Consultar llama a `executeRecaptcha`, que pide un token y lo envía en `g-recaptcha-response`.
- El modelo es de puntuación: si la sesión parece humana, no se ve nada; si la puntuación baja (muchas consultas seguidas, patrón robótico), el SRI rechaza la consulta o muestra un desafío visible.

## Medido en vivo (2026-11-09)

- 5 consultas de mes completo seguidas con el botón del portal, ~8 s entre cada una: **0 desafíos**.
- Las descargas (XML, RIDE, reporte TXT) y la paginación **no usan captcha**.
- El XML de cualquier clave sale del servicio web público del SRI, **sin captcha**.

Por eso el flujo de Legajo pide **un solo token por mes consultado** (la consulta del listado). Un año completo de recibidos son 12 tokens invisibles, repartidos a ritmo humano.

## Enfoque

1. **El token lo genera la página del usuario, como siempre.** El conductor dispara la misma función del portal; Legajo no fabrica ni reutiliza tokens.
2. **Menos consultas.** Un mes completo por consulta (`dia=0`): un año de facturas recibidas son 12 tokens, no 365.
3. **Ritmo humano.** Una consulta a la vez, con pausas aleatorias (p. ej. 4–9 s) y descargas espaciadas. Tope configurable de consultas por minuto.
4. **Humano en el bucle.** Si aparece el desafío visible o la consulta se rechaza, la cola se pausa, la pestaña del SRI pasa al frente y el popup muestra "Verifica el captcha para continuar". Al resolverlo, la cola sigue sola.
5. **Caché.** Las filas ya consultadas se guardan por mes; reanudar un lote no repite consultas.

## Alternativas vistas en internet y por qué no van en el plan base

| Técnica | Qué hace | Problema |
|---|---|---|
| Servicios de resolución (2Captcha, CapSolver, Anti-Captcha) | Envían la site key y la URL a granjas humanas o a IA que devuelven un token | Sacan datos de la sesión tributaria del usuario hacia terceros, cuestan dinero por token y son la causa más común de bajas en la Chrome Web Store. |
| Resolución por audio (tipo Buster) | Descarga el audio del desafío y lo transcribe | Solo sirve para el desafío visible v2; Enterprise lo limita, y sigue siendo evasión automatizada. |
| Reutilizar o falsificar tokens | Reenvía un token viejo o generado fuera | Los tokens son de un solo uso y caducan en 2 minutos; el SRI los valida en servidor. |
| Cambiar la huella del navegador | Simula otro navegador para subir la puntuación | Frágil, y es exactamente lo que reCAPTCHA Enterprise está hecho para detectar. |

Si se decide añadir alguna alternativa, debería ser **opcional, apagada por defecto, con la clave del propio usuario** y explicada en la política de privacidad.
