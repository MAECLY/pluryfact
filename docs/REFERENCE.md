# Referencia: pantallas de consulta de SRI en Línea

Material verificado el 2026-11-09 a partir del HTML real de las dos pantallas (copiado por Miguel con sesión iniciada). Los fixtures anonimizados están en `test/fixtures/`. Lo marcado **por verificar** se confirma en la prueba E2E con sesión real.

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
