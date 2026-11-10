# Arquitectura

```
popup (TS + Tailwind)                    background (service worker)
  periodo, bandeja, tipos, emisor   ──►   cola de lotes, ritmo, reintentos,
  formatos, progreso, pausar               chrome.downloads, historial
                                                │  mensajes
                                                ▼
                         content script en srienlinea.sri.gob.ec (ISOLATED)
                           · lee tablas (lib/extract) y ViewState
                           · descarga con fetch POST same-origin (lib/jsf)
                                                │  postMessage
                                                ▼
                         conductor en el MAIN world de la página
                           · rellena combos y llama a los mismos handlers del
                             portal (PrimeFaces.ab / executeRecaptcha)
                           · avisa cuando la tabla se actualiza
```

## Flujo por mes (recibidos)

1. Conductor: pone año/mes/`dia=0`/tipo y dispara Consultar del portal → **1 reCAPTCHA invisible**.
2. Content script: POST del **reporte TXT** → todas las claves del mes (`lib/reporte`). Se filtran por emisor y fechas (`lib/filtro`).
3. Background: **XML** de cada clave por el servicio web público (`lib/sri-ws`), en paralelo moderado y con reintentos. Sin captcha.
4. Si se pidió **RIDE**: el conductor vuelve a la página 1 y recorre páginas con el paginador del portal; el content script descarga `lnkPdf` de las filas de cada página. Sin captcha.
5. Background: ZIP y `chrome.downloads`.

Emitidos sigue el mismo flujo, pero con una consulta por día (sin captcha).

## Decisiones

1. **Usar la sesión y la página real del usuario.** No se guardan credenciales ni se hace login. La extensión solo trabaja en una pestaña de SRI en Línea con la sesión iniciada.
2. **Consultar con los propios controles del portal.** El conductor (MAIN world) pone año/mes/día/tipo y dispara la misma acción que el botón Consultar. Así el ViewState, los `update` de PrimeFaces y el reCAPTCHA siguen siendo los del SRI; no se reimplementa su protocolo AJAX.
3. **XML por servicio web, RIDE por POST directo.** Cada RIDE es un POST del formulario con el id del enlace (`lib/jsf.cuerpoDescarga`). Se hace con `fetch` desde el content script (mismo origen, cookies de la sesión) y el resultado va al background, que lo empaqueta en ZIP o lo guarda con `chrome.downloads` bajo `legajo/<ruc>/<bandeja>/<aaaa>/<mm>/`.
4. **Minimizar consultas.** Emitidos: una consulta por día (la pantalla no admite rango). Recibidos: una por mes con `dia=0`, y el filtro por fecha y emisor se aplica después (`lib/periodo`, `lib/filtro`).
5. **Ritmo humano.** Una consulta a la vez, pausa aleatoria entre consultas y descargas, y reintento con espera exponencial ante errores o sesión caducada.

## Módulos

| Archivo | Responsabilidad | Estado |
|---|---|---|
| `lib/clave.ts` | Clave de acceso: partes y dígito módulo 11 | ✅ probado con claves reales |
| `lib/selectors.ts` | Único lugar con ids del portal | ✅ |
| `lib/extract.ts` | Tablas → filas tipadas | ✅ con fixtures |
| `lib/periodo.ts` | Día/rango/mes/año → plan de consultas | ✅ |
| `lib/filtro.ts` | Emisor (RUC/razón social), rango, tipo | ✅ |
| `lib/archivos.ts` | Carpetas y nombres de archivo | ✅ |
| `lib/jsf.ts` | Cuerpo del POST y `partial-response` | ✅ verificado en vivo (XML, PDF, TXT) |
| `lib/reporte.ts` | Reporte TXT ISO-8859-1 → claves | ✅ formato verificado en vivo |
| `lib/sri-ws.ts` | XML autorizado por clave (SOAP) | ✅ verificado en vivo |
| conductor MAIN world | Disparar consultas con los controles del portal | ⏳ requiere sesión real |
| background / cola | Ritmo, reintentos, ZIP, historial | ⏳ |
| popup | UI | ⏳ |
