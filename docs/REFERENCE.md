# Referencia: pantallas de consulta de SRI en Línea

Material verificado el 2026-11-09: primero con el HTML real de las dos pantallas y luego **en vivo con Claude-in-Chrome sobre la sesión de Miguel** (ver «Verificado en vivo» al final). Fixtures anonimizados en `test/fixtures/`.

Base: `https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/`. Menú: `pages/consultas/menu.jsf`.

## Tecnología del portal

- JSF (Mojarra) + PrimeFaces + RichFaces. Cada formulario lleva `javax.faces.ViewState` (`<n>:<n>`), que hay que reenviar en cada POST.
- Consultas: AJAX de PrimeFaces (`PrimeFaces.ab`) que actualiza `frmPrincipal:panelListaComprobantes` y la tabla. La respuesta es un `partial-response` XML con el HTML nuevo (**por verificar** el nombre exacto de cada `update`).
- Descargas (XML, RIDE, reporte TXT): POST completo del formulario `frmPrincipal` vía `mojarra.jsfcljs`, añadiendo el par `id-del-enlace=id-del-enlace`. La respuesta es el archivo (**por verificar** `Content-Disposition`).

## Emitidos — `pages/consultas/recuperarComprobantes.jsf`

| Campo | name | Valores |
|---|---|---|
| Tipo de búsqueda | `frmPrincipal:opciones` | `ruc` · `clave` |
| RUC (deshabilitado, viene de la sesión) | `frmPrincipal:txtParametro` | 13 dígitos |
| Fecha de emisión (**un solo día**) | `frmPrincipal:calendarFechaDesde_input` | `dd/mm/aaaa` |
| Estado | `frmPrincipal:cmbEstadoAutorizacion` | `AUT` · `NAT` · `PPR` |
| Tipo | `frmPrincipal:cmbTipoComprobante` | 1 Factura · 2 Liquidación · 3 NC · 4 ND · 5 Guía · 6 Retención |
| Establecimiento | `frmPrincipal:cmbEstablecimiento` | `""` (todos) o `001`… |
| Punto de emisión | `frmPrincipal:txtPuntoEmision` | 3 dígitos, opcional |

- Botón: `frmPrincipal:btnConsultar`. **Sin reCAPTCHA.**
- Tabla `frmPrincipal:tablaCompEmitidos`, 10 columnas: Nro, Tipo y serie, Clave, Fecha-hora autorización, Fecha emisión, Valor sin impuestos, IVA, Importe total, RIDE, Documentos relacionados.
- Por fila `i` (atributo `data-ri`): enlace RIDE `frmPrincipal:tablaCompEmitidos:<i>:lnkPdf`. **No hay enlace de XML en la tabla de emitidos**; existe un diálogo "Archivo XML" con un botón `j_idt913:j_idt914` (**por verificar** cómo se abre para una fila).
- Como la fecha es de un solo día, un mes completo de emitidos son ~30 consultas.

## Recibidos — `pages/consultas/recibidos/comprobantesRecibidos.jsf`

| Campo | name | Valores |
|---|---|---|
| Año | `frmPrincipal:ano` | 2022 … año actual |
| Mes | `frmPrincipal:mes` | 1–12 |
| Día | `frmPrincipal:dia` | `0` (todos) o 1–31 |
| Tipo | `frmPrincipal:cmbTipoComprobante` | 1, 2, 3, 4, 6 (sin guías) |

- Botón: `frmPrincipal:btnBuscar` → `executeRecaptcha('consulta_cel_recibidos','SI')` → `rcBuscar()` con el token en `g-recaptcha-response`. reCAPTCHA **Enterprise invisible**, site key `6LdukTQsAAAAAIcciM4GZq4ibeyplUhmWvlScuQE`.
- Con `dia=0` una consulta devuelve el mes completo: un año de recibidos son 12 consultas por tipo.
- Tabla `frmPrincipal:tablaCompRecibidos`, 12 columnas: Nro, RUC + razón social del emisor (separados por `<br>`), Tipo y serie, Clave, Fecha-hora autorización, Fecha emisión, Valor sin impuestos, IVA, Importe total, Documento (XML), RIDE, Documentos relacionados.
- Por fila `i`: `frmPrincipal:tablaCompRecibidos:<i>:lnkXml` y `…:<i>:lnkPdf`.
- Paginador de 25/50/75 filas. `data-ri` es el índice global (**por verificar** que el índice del enlace siga siendo global al cambiar de página).

## Ambas pantallas

- Reporte TXT del listado actual: enlace `frmPrincipal:lnkTxtlistado`.
- Formatos de número: punto decimal sin miles (`7246.94`). Fechas `dd/mm/aaaa` y `dd/mm/aaaa hh:mm:ss`.
- "Tipo y serie" usa dos espacios: `Factura  001-001-000001800`.
- La clave de acceso trae fecha, tipo, RUC del emisor, serie y secuencial; `src/lib/clave.ts` la descompone y valida el dígito módulo 11 (verificado con claves reales).

## Verificado en vivo (2026-11-09, recibidos)

**Sesión**
- Abrir una URL del portal directamente (barra de direcciones) **pierde la sesión** y redirige al login de Keycloak. El usuario debe entrar desde el menú del portal; la URL real lleva parámetros `contextoMPT`, `pathMPT`, `actualMPT`, `linkMPT`. Legajo **nunca navega**: solo trabaja en la pestaña que el usuario abrió.

**reCAPTCHA**
- `cargarRecaptcha` hace `grecaptcha.enterprise.render(contenedor, {sitekey, size:'invisible', callback:onSubmit})`; `executeRecaptcha` llama a `grecaptcha.enterprise.execute({action})`; `onSubmit` llama a `rcBuscar()` y `onsuccess` hace `grecaptcha.enterprise.reset()`.
- 5 consultas de mes completo seguidas (octubre a junio, ~8 s entre cada una): **ninguna mostró desafío**; cada consulta tarda ~2 s.

**Consulta y paginación**
- Resultado de octubre: 3 páginas de 50 filas (`rpp` 25/50/75).
- `data-ri` es **índice global**: la página 2 tiene filas 50–99.
- **La página se conserva entre consultas**: tras consultar otro mes la tabla sigue en la página 2. Hay que volver a la 1.
- Paginar (`.ui-paginator-next`) es AJAX **sin captcha**.

**Descargas por POST** (`new FormData(frmPrincipal)` + `id=id` del enlace, `fetch` same-origin)
- XML: `200`, `application/xml`, `attachment; filename="Factura.xml"`; contenido `<autorizacion><estado>AUTORIZADO</estado><numeroAutorizacion>…`.
- RIDE: `200`, `application/pdf`, `filename="Factura.pdf"`, empieza con `%PDF`.
- Una fila que **no está en la página visible** devuelve la página HTML (≈230 KB), no el archivo: el servidor solo resuelve índices de la página actual.
- Ninguna descarga pide captcha.

**Reporte TXT** (`frmPrincipal:lnkTxtlistado`)
- `application/txt`, `filename="<RUC>_Recibidos.txt"`, **ISO-8859-1**, TAB, LF, **todo el listado** (126 filas en octubre, no solo la página).
- Columnas: `RUC_EMISOR RAZON_SOCIAL_EMISOR TIPO_COMPROBANTE SERIE_COMPROBANTE CLAVE_ACCESO FECHA_AUTORIZACION FECHA_EMISION IDENTIFICACION_RECEPTOR VALOR_SIN_IMPUESTOS IVA IMPORTE_TOTAL NUMERO_DOCUMENTO_MODIFICADO`.

**Servicio web público de autorización**
- `POST https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline`, SOAP 1.1, operación `autorizacionComprobante(claveAccesoComprobante)`.
- **Requiere la cabecera `SOAPAction: ""`**; sin ella responde una página HTML de redirección.
- Sin sesión ni captcha, ~100–200 ms por clave. Comprobante escapado con entidades dentro de `<comprobante>`. Clave inexistente → `<numeroComprobantes>0</numeroComprobantes><autorizaciones/>`.
- Un primer intento dio timeout transitorio: hace falta reintento.

## Verificado en vivo (2026-11-09, emitidos)

- **Sin reCAPTCHA** (`executeRecaptcha` no existe en la página). 10 consultas de un día seguidas, 1,5 s entre cada una: sin freno; ~0,4–0,75 s por consulta.
- La consulta se dispara con `frmPrincipal:btnConsultar` tras poner `frmPrincipal:calendarFechaDesde_input` (`dd/mm/aaaa`).
- Mensajes en `formMessages:messages`:
  - `No existen datos para los parámetros  ingresados` (dos espacios) → día sin comprobantes.
  - `La fecha ingresada debe ser menor a la fecha actual` → **hoy no se puede consultar**; el último día es ayer.
- Tabla `frmPrincipal:tablaCompEmitidos`: 10 columnas, enlaces por fila `j_idt53` (detalle), `lnkPdf`, `j_idt78` (relacionados). **Sin enlace de XML.** Paginador con 5/10/15 filas.
- RIDE por POST (`lnkPdf`): `application/pdf`, `filename="Factura.pdf"`.
- Reporte TXT: `filename="<RUC>_EmitidosAutorizados.txt"`, 8 columnas `COMPROBANTE SERIE_COMPROBANTE CLAVE_ACCESO FECHA_AUTORIZACION FECHA_EMISION VALOR_SIN_IMPUESTOS IVA IMPORTE_TOTAL`; `FECHA_EMISION` con hora.
- **XML de emitidos por el servicio web**: comprobado con las dos facturas del 06/11/2026; `importeTotal` del XML coincide con la tabla.

