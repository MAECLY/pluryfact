# Integración con Pluryprint

Estado: **en desarrollo**. Llega con **Pluryfact 0.2.0** (después de que Chrome
Web Store apruebe la 0.1.0) y **Pluryprint 0.0.6**, que trae el host nativo
`pluryprint-bridge`. Nada de esto se publica en la tienda todavía.

Pluryfact descarga en lote los comprobantes del SRI; Pluryprint (app de
escritorio de MAECLY para Windows y macOS) imprime en lote. La integración
permite mandar a imprimir, sin pasar por el disco ni por internet, lo que
Pluryfact acaba de bajar o un `pluryfact_*.zip` de antes:

- **RIDE en PDF**, tal cual los entrega el portal (se valida la cabecera `%PDF-`).
- **XML autorizados**: Pluryprint arma una representación impresa tipo RIDE a
  partir del XML (factura, nota de crédito, nota de débito, retención, guía de
  remisión y liquidación de compra). Sirve cuando el usuario no bajó el RIDE
  (más rápido: el XML viene del servicio web sin paginar el portal) o cuando un
  RIDE falló.
- **Reporte TXT** del SRI, opcional, al final del lote.

El ZIP en sí nunca viaja: Pluryfact manda su contenido.

## 1. Opciones evaluadas

| | Opción | Permisos nuevos en Pluryfact | Veredicto |
|---|---|---|---|
| a | Pluryprint abre o importa el ZIP de Pluryfact («Abrir con», arrastrar, asociación de `.zip`) | Ninguno | **Descartada como transporte.** Obliga a descomprimir en Rust un archivo no confiable (zip-slip, ZIP bomba, avisos RUSTSEC del crate `zip`), el usuario tiene que encontrar el ZIP (Chrome pudo renombrarlo a `(1)` o guardarlo en otra carpeta) y no hay canal de vuelta. Lo útil de la idea queda cubierto por **«Imprimir un ZIP…»** dentro de Pluryfact, que descomprime con fflate en la extensión. |
| b | Deep link `pluryprint://` desde la página | Ninguno (pero haría falta `downloads` para conocer la ruta) | **Descartada.** No transporta bytes, solo una pista; cualquier web puede invocarlo, así que nunca podría imprimir sin confirmar; Chrome muestra un aviso en cada uso y no hay respuesta. |
| c | Servidor HTTP en `localhost` dentro de Pluryprint | `host_permissions` para `http://127.0.0.1/*` | **Descartada.** Abre un puerto local (rompe el modelo de seguridad de Pluryprint, que hoy solo sale a github.com), exige token, `Origin` y CORS, choca con Private/Local Network Access de Chrome y la tienda lo revisa igual que cualquier permiso de host. |
| d | Carpeta vigilada: la página escribe PDFs con File System Access (`showDirectoryPicker`) y Pluryprint vigila esa carpeta | Ninguno | **Descartada.** La página de la extensión debe estar abierta y con un gesto del usuario en cada sesión, Pluryprint no tiene «hot folder» (está en ideas futuras), hay carreras entre escritura y lectura y no hay canal de vuelta ni confirmación. |
| e | **Chrome Native Messaging** con un host de Pluryprint | `nativeMessaging`, **opcional** | **Elegida.** Canal local autenticado por Chrome (solo los orígenes de `allowed_origins`), sin puertos, con respuesta por mensaje, límites conocidos (1 MB host→Chrome, 64 MiB Chrome→host) y sin tocar rutas: viajan bytes validados. El permiso es opcional, así que la actualización no desactiva Pluryfact a quien no usa Pluryprint. |

Alternativa que también se descartó: pedir `downloads` para conocer la ruta del
ZIP y pasársela a Pluryprint. La advertencia («Administrar tus descargas») es
alarmante para una extensión tributaria y el host tendría que leer rutas
elegidas por la extensión, que es justo lo que se quiere evitar.

## 2. Arquitectura

```
pluryfact.html (Descargas: «Imprimir un ZIP…»)        pestaña del SRI (content script)
   fflate descomprime el ZIP en memoria                  conserva el último resultado en memoria
   lib/seleccion-impresion: qué y en qué orden           lib/seleccion-impresion
   lib/pluryprint: ClientePluryprint                     lib/pluryprint: ClientePluryprint
            │  runtime.connect({ name: 'pluryprint' })            │
            └──────────────────────┬──────────────────────────────┘
                                   ▼
                 background (service worker): lib/puente-pluryprint
                   · valida remitente (la propia extensión: sus páginas o su
                     content script en la pantalla de comprobantes)
                   · valida la forma de cada petición (v1, tipo conocido, tamaño)
                   · comprueba el permiso opcional
                   · ÚNICO contexto que llama runtime.connectNative
                                   │  stdio: u32 en orden nativo + JSON UTF-8
                                   ▼
                 pluryprint-bridge (com.maecly.pluryprint)
                   · valida argv[1] contra los orígenes del manifiesto instalado
                   · valida todo: tamaños, base64, %PDF-, XML sin DTD, sha256, nombres
                   · <data_dir>/inbox/<jobId>/NNNN-<nombre>
                   · commitJob → handoff schema 1, source "pluryfact"
                     y lanza la GUI desacoplada: --invoke=context-menu --files-from … --action …
                                   ▼
                 Pluryprint (GUI): Print Job / cola, con la etiqueta «Desde Pluryfact»
```

- **Por qué el puente en el background:** Chrome no ofrece `connectNative` en
  content scripts, y concentrar la llamada en un solo sitio permite revisar el
  permiso y el remitente una vez. El cliente (`ClientePluryprint`) no sabe de
  Chrome: recibe un puerto inyectado, igual en la página, en el content script
  y en los tests.
- **Vida del service worker:** un puerto nativo abierto mantiene vivo el
  service worker (Chrome 105+) y cada `putFile` es un evento; aun así cada
  operación abre su propio puerto y lo cierra al terminar.
- **Una conexión por operación:** consultar el estado, listar perfiles o enviar
  un trabajo abren y cierran su propio puerto. Si la página se cierra a mitad,
  el puente cierra el puerto nativo y el host borra el trabajo sin `commitJob`.

### Archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/pluryprint.ts` | Cliente del protocolo v1: saludo, listas, envío por trozos con sha256, tiempos límite y errores tipados en español. |
| `src/lib/puente-pluryprint.ts` | Puente del background y adaptador del lado de la página (`puertoHaciaPuente`). |
| `src/lib/conexion-pluryprint.ts` | Permiso opcional (`permissions.request/contains/remove`) y puerto hacia el puente. |
| `src/lib/seleccion-impresion.ts` | Qué archivos se imprimen y en qué orden; lectura segura del ZIP; textos del resumen. |
| `src/lib/envio-pluryprint.ts` | Envío con los ajustes del usuario; regla de confirmación de más de 50 documentos. |
| `src/lib/ajustes.ts` | Sección `pluryprint` con normalización y migración. |
| `src/entrypoints/pluryfact/pluryprint.ts` | UI de la página: barra lateral, Avanzado y panel de Descargas. |
| `src/entrypoints/sri.content.ts` | Conserva el último resultado y lo envía (a pedido o al terminar). |
| `scripts/pluryprint-host-falso.ts` | Host falso del protocolo, para tests y E2E. |
| `test/fixtures/pluryprint-protocol/` | Copia byte a byte de los fixtures canónicos de Pluryprint. |

## 3. Protocolo v1

Cada mensaje: `{ "v": 1, "id": "<string>", "type": "<tipo>", … }`. Respuesta:
`{ "v": 1, "id", "type", "ok": true, … }` o
`{ "v": 1, "id", "type", "ok": false, "error": { "code", "message" } }` (mensaje
en inglés; Pluryfact muestra su propio texto en español).

| type | Petición | Respuesta ok |
|---|---|---|
| `hello` | `client: "pluryfact"`, `clientVersion`, `protocols: [1]` | `host: "pluryprint"`, `hostVersion`, `protocol: 1`, `capabilities`, `limits { maxFileBytes 50 MiB, maxFiles 5000, maxChunkBytes 16 MiB, maxJobBytes 1 GiB }` |
| `listPrinters` | — | `printers: [{ id, name, isDefault, capabilities? }]` |
| `listProfiles` | — | `profiles: [{ id, name, isDefault }]` |
| `beginJob` | `source: "pluryfact"`, `label` (≤ 120, sin RUC), `action`, `profileId?`, `printerId?`, `overrides? { copies, duplex, color, paper, orientation, collate }`, `expectedFiles` | `jobId` |
| `putFile` | `jobId`, `index`, `name` (solo el nombre), `kind: pdf\|xml\|txt`, `size`, `sha256` (del archivo completo), `chunk`, `chunks`, `data` (base64 del trozo) | `received` (bytes acumulados), `complete` |
| `commitJob` | `jobId` | `state: "handed-off"`, `files` |
| `abortJob` | `jobId` | `state: "aborted"` |

Reglas del lado de Pluryfact:

- **Troceo:** 8 MiB de bytes crudos por `putFile` como máximo (o
  `limits.maxChunkBytes` si es menor), antes de base64: un trozo pesa ~11 MB en
  JSON, muy por debajo de los 64 MiB que Chrome permite hacia el host.
- **sha256** de cada archivo completo con `crypto.subtle`.
- **Orden de impresión = orden de `index`.**
- **Tiempos límite:** `hello` 15 s (arranque en frío del host), listas 20 s,
  `putFile` 60 s, `commitJob` 45 s (lanza la GUI), resto 15 s.
- Si algo falla después de `beginJob`, Pluryfact manda `abortJob` (salvo que el
  puerto ya esté cerrado: entonces el host lo borra solo).
- Antes de abrir el trabajo se comprueban localmente `maxFiles`, `maxFileBytes`
  y `maxJobBytes`.

### Errores y lo que ve el usuario

| Código | Origen | Texto en Pluryfact |
|---|---|---|
| `no_instalado` | Chrome: «Specified native messaging host not found.» | Pluryprint no está instalado en este equipo, o no está conectado con este navegador. (+ enlace de descarga) |
| `sin_permiso` | Falta el permiso opcional | Pluryfact no tiene permiso para comunicarse con Pluryprint. Pulsa «Conectar con Pluryprint» en Avanzado. |
| `origin_not_allowed` | Chrome («…forbidden») o el host | Pluryprint no reconoce esta copia de Pluryfact… (`pluryprint-cli bridge install --extra-origin`) |
| `version_incompatible` | Saludo sin protocolo 1 o sin capacidades | Actualiza Pluryprint: esta versión no sabe recibir comprobantes de Pluryfact. |
| `unsupported_version`, `unknown_type` | Host | Actualiza Pluryprint (y Pluryfact). |
| `too_large`, `too_many_files` | Host o chequeo local | Un archivo o el trabajo supera el tamaño… / Son demasiados archivos… |
| `bad_pdf`, `checksum_mismatch`, `bad_request` | Host | Un RIDE no es un PDF válido. / Un archivo llegó dañado… / Dato inválido. |
| `unknown_job`, `job_incomplete`, `io_error`, `launch_failed`, `internal` | Host | Mensajes propios (ver `MENSAJES` en `lib/pluryprint.ts`). |
| `desconectado`, `tiempo_agotado`, `respuesta_invalida`, `cancelado` | Cliente | Pluryprint cerró la conexión… / no respondió a tiempo… / Envío cancelado. |

### Fixtures de contrato

Los canónicos viven en `pluryprint/src-tauri/tests/fixtures/bridge-protocol/` y
se copian byte a byte a `test/fixtures/pluryprint-protocol/`.
`test/pluryprint-contrato.test.ts` comprueba que el cliente produce exactamente
esas peticiones, entiende esas respuestas, que hay un fixture por cada código de
error y, si `../pluryprint` existe al lado, que los `.json` son idénticos.

## 4. Seguridad

- **Permiso opcional.** `nativeMessaging` va en `optional_permissions` y se pide
  con `permissions.request` en el clic de «Conectar con Pluryprint». «Desconectar»
  lo quita (`permissions.remove`). El build E2E (`PLURYFACT_E2E=1`) lo vuelve
  obligatorio solo para probar sin el diálogo, y sale a `.output-e2e/`.
- **Quién puede hablar con el host.** Chrome solo lanza el host para los orígenes
  de `allowed_origins`: en producción, solo
  `chrome-extension://ibgodfpcihlddbbfaoooehfgbmahipbj/`. Orígenes extra (copias
  desempaquetadas, E2E) solo con `pluryprint-cli bridge install --extra-origin`.
  El host además valida `argv[1]` contra los orígenes del manifiesto instalado.
- **Quién puede usar el puente.** El background solo atiende `runtime.Port`
  llamados `pluryprint` de la propia extensión: sus páginas
  (`chrome-extension://<id>/…`) o su content script en
  `srienlinea.sri.gob.ec/comprobantes-electronicos-internet/` (con pestaña).
  Ninguna web ni otra extensión llega (no hay `externally_connectable`).
- **Forma de cada petición.** Sobre v1, `id` ≤ 64, tipo conocido, sin campos de
  respuesta y `data` acotada al trozo máximo; lo demás se contesta `bad_request`
  sin llegar al host.
- **Nunca rutas.** Pluryfact manda bytes y un nombre; el host fuerza basename,
  quita `..`, separadores y controles, recorta a 120 caracteres y fuerza la
  extensión según `kind`. El host nunca lee rutas que diga la extensión.
- **ZIP elegido por el usuario.** Se descomprime en la página con fflate y solo
  entradas con ruta relativa segura, extensión `pdf|xml|txt`, ≤ 50 MiB cada una,
  ≤ 1 GiB en total y ≤ 20 000 entradas. Solo se aceptan nombres de Pluryfact con
  clave de acceso válida (dígito módulo 11) cuyo RUC coincide con el del nombre;
  PDF sin `%PDF-` y XML que no son de comprobante se ignoran y se cuentan.
- **Papel.** La acción por defecto es `configure`: Pluryprint se abre para
  confirmar. `print-default` solo si el usuario la elige, y con más de 50
  documentos Pluryfact pide confirmación en el botón; el envío automático al
  terminar no puede confirmar, así que con más de 50 abre Pluryprint en su lugar.
- **Riesgo aceptado.** Un proceso local del mismo usuario puede ejecutar el
  binario del host o escribir en el directorio de handoff de Pluryprint; ya
  podía hacerlo antes (menús contextuales). No hay escalada: todo corre como el
  usuario.

## 5. Privacidad

- Nada sale del equipo: la extensión entrega bytes a un proceso local; ni
  Pluryfact ni el host abren conexiones de red.
- Sin telemetría. El registro de diagnóstico anota solo conteos y códigos de
  error (pasa por `crearRegistro`, que enmascara RUC y claves); nunca nombres ni
  contenido de archivos.
- La etiqueta del trabajo no lleva el RUC («Recibidos · 2026-10»).
- Los archivos quedan en `<data_dir>/inbox/<jobId>/` de Pluryprint; la GUI barre
  al arrancar las carpetas de más de 7 días.
- La pestaña del SRI conserva en memoria los archivos del último trabajo para
  poder imprimirlos sin releer el ZIP; se sueltan al empezar otro trabajo o al
  cerrar la pestaña.
- Textos que dejaron de ser exactos y se reescribieron: «Todo ocurre en tu
  navegador» → «Todo ocurre en tu equipo»; «Solo habla con el SRI» → «En
  internet, solo habla con el SRI… Fuera de internet, solo con Pluryprint, y
  solo si tú lo conectas». Borrador de la pestaña de privacidad para la 0.2.0 en
  `store-assets/PRIVACY-0.2.0-borrador.md`.

## 6. Plataformas y navegadores

| | Estado |
|---|---|
| Windows 10/11 | Soportado. El instalador NSIS de Pluryprint escribe el manifiesto y las claves `HKCU\Software\{Google\Chrome, Microsoft\Edge, Chromium}\NativeMessagingHosts\com.maecly.pluryprint` (Brave en Windows lee la de Chrome); el desinstalador las borra. |
| macOS | Soportado. La app registra en cada arranque los manifiestos de usuario de los navegadores instalados (`~/Library/Application Support/<navegador>/NativeMessagingHosts/`), apuntando al `pluryprint-bridge` dentro del `.app`; no registra si corre trasladada (App Translocation). Hay que abrir Pluryprint una vez después de instalarlo. |
| Linux | `pluryprint-cli bridge install` funciona con rutas XDG de usuario, pero no se promete: Chromium en snap/flatpak no ve hosts del sistema. |
| Navegadores | Chrome, Edge, Brave y Chromium. Tienda: solo Chrome Web Store. |
| Equipos gestionados | Las políticas `NativeMessagingAllowlist`/`Blocklist` y `NativeMessagingUserLevelHosts=false` pueden bloquear el host; Pluryfact lo verá como «no instalado». |

Comprobado en esta Mac (macOS, Chromium de Playwright 156): Chromium lee los
manifiestos de usuario de `<--user-data-dir>/NativeMessagingHosts/`, pasa el
origen como primer argumento y devuelve «Specified native messaging host not
found.» si no hay manifiesto. **Ojo en macOS:** Chrome lanza el host como
proceso «responsable» propio; si el host lee algo dentro de `~/Documents`,
`~/Desktop` o `~/Downloads` sin permiso de privacidad (TCC), se queda colgado sin
mostrar diálogo. El host real vive en `/Applications`; el host falso del E2E se
empaqueta en una carpeta temporal por eso mismo.

## 7. Interfaz

- **Avanzado → Pluryprint.** Estado (no conectado / conectado vX / no instalado,
  con enlace a https://pluryprint.maecly.com/), «Conectar con Pluryprint»
  (permiso + saludo), «Comprobar de nuevo», «Desconectar», y las opciones: qué
  imprimir (RIDE, XML o ambos), XML si falta el RIDE, reporte, orden, acción,
  perfil, impresora, copias, doble cara y color (vacío = lo del perfil).
- **Nueva descarga.** Casilla «Enviar a Pluryprint al terminar» (solo con
  Pluryprint conectado) que fija los formatos necesarios: RIDE si se imprime
  RIDE, XML si se imprime XML (solo XML no obliga a bajar el RIDE), TXT si se
  incluye el reporte. El resumen explica qué se enviará y qué hará Pluryprint.
- **Tarjeta del trabajo** (popup y página). Línea con el estado del envío.
- **Descargas.** «Imprimir un ZIP…» para cualquier `pluryfact_*.zip`, e
  «Imprimir con Pluryprint» en la fila del último trabajo mientras la pestaña
  del SRI lo tiene en memoria (si no, «Imprimir su ZIP…»). Antes de enviar, un
  panel resume «Se imprimirán N RIDE + M XML + el reporte» y avisa de lo que no
  entra.
- **Acerca de.** Fila del permiso opcional y promesas reescritas.
- **Barra lateral.** «Pluryprint: conectado / no conectado / no instalado / sin permiso / sin respuesta / actualízalo / con problemas». «Sin respuesta» solo cuando Pluryprint no respondió (se cortó o se agotó el tiempo); el detalle de cualquier problema va en el `title`.
- **Popup.** La misma casilla y, al terminar, «Imprimir con Pluryprint», que
  abre la página con el resumen.

### Qué se manda de cada comprobante

| Ajuste | Tiene RIDE y XML | Solo RIDE | Solo XML |
|---|---|---|---|
| RIDE (por defecto) + XML si falta | RIDE | RIDE | XML |
| RIDE sin respaldo | RIDE | RIDE | — (se avisa) |
| XML | XML | RIDE (mejor que saltarlo) | XML |
| Ambos | RIDE y luego XML | RIDE | XML |

Orden estable: por fecha de emisión (por defecto), por emisor, por tipo o como
los entregó el portal; los reportes van al final.

## 8. Matriz de operaciones

Filas: cada operación o salida de Pluryfact. Columnas: cada operación de
Pluryprint. Cada celda dice si el cruce aplica, por dónde se expone y en qué
fase.

**Leyenda:** **P** = MVP, por el protocolo y elegible en la UI de Pluryfact ·
**F** = MVP, solo en la UI de Pluryfact · **R** = MVP, lo resuelve Pluryprint en
su UI (Pluryfact no lo controla) · **S** = fase siguiente · **D** = descartado
(ver nota) · **·** = no aplica.

Columnas: **cfg** configure (abrir para confirmar) · **cola** queue ·
**dir** print-default · **perf** perfiles · **imp** impresoras · **cop** copias
· **dup** dúplex · **col** color · **pap** papel · **ran** rango de páginas ·
**esc** escala · **ori** orientación · **int** intercalado · **est** estado en
la cola · **pau** pausar · **can** cancelar · **rei** reintentar · **cli** CLI
`print --json` · **ctx** menús contextuales · **con** «Abrir con» · **arr**
arrastrar · **xml** representación de XML · **act** actualizaciones.

| Pluryfact \ Pluryprint | cfg | cola | dir | perf | imp | cop | dup | col | pap | ran | esc | ori | int | est | pau | can | rei | cli | ctx | con | arr | xml | act |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bandeja emitidos | P | P | P | S¹ | S¹ | S² | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Bandeja recibidos | P | P | P | S¹ | S¹ | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Periodo día | P | P | P | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Periodo rango | P | P | P | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Periodo mes | P | P | P | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Periodo año | P | P | P³ | · | · | · | · | · | · | · | · | · | · | S⁴ | · | · | · | · | · | · | · | · | · |
| Filtro RUC / razón social | P | P | P | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| XML | P | P | P | P | P | P | P | P | R | D⁵ | R | R | R | S⁴ | R | R | R | D⁶ | R⁷ | R⁷ | R⁷ | R | P⁸ |
| RIDE (PDF) | P | P | P | P | P | P | P | P | R | D⁵ | R | R | R | S⁴ | R | R | R | D⁶ | R⁹ | R⁹ | R⁹ | · | P⁸ |
| Reporte TXT | P | P | P | P | P | P | P | P | R | D⁵ | R | R | R | S⁴ | R | R | R | D⁶ | R⁹ | R⁹ | R⁹ | · | P⁸ |
| ZIP (Imprimir un ZIP…) | P | P | P | P | P | P | P | P | R | D⁵ | R | R | R | S⁴ | R | R | R | D⁶ | D¹⁰ | D¹⁰ | D¹⁰ | P | P⁸ |
| Historial (Descargas) | P | P | P | P | P | P | P | P | · | · | · | · | · | S⁴ | S¹¹ | S¹¹ | S¹¹ | · | · | · | · | · | · |
| Reanudar | P¹² | P¹² | P¹² | · | · | · | · | · | · | · | · | · | · | S¹³ | · | · | · | · | · | · | · | · | · |
| Repetir con los mismos filtros | F¹⁴ | F¹⁴ | F¹⁴ | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Copiar resumen | F¹⁵ | F¹⁵ | F¹⁵ | · | · | · | · | · | · | · | · | · | · | S⁴ | · | · | · | · | · | · | · | · | · |
| Cancelar descarga | F¹⁶ | F¹⁶ | F¹⁶ | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Notificaciones | S¹⁷ | S¹⁷ | S¹⁷ | · | · | · | · | · | · | · | · | · | · | S⁴ | · | · | · | · | · | · | · | · | · |
| Temas | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Ritmo de consulta | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Registro de diagnóstico | F¹⁸ | F¹⁸ | F¹⁸ | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | F¹⁸ |
| Borrar datos | F¹⁹ | F¹⁹ | F¹⁹ | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |

Notas:

1. **Perfil o impresora por bandeja** (por ejemplo, emitidos a la impresora de
   la oficina y recibidos a otra). Hoy hay un solo perfil e impresora en
   Avanzado; el protocolo ya admite `profileId`/`printerId` por trabajo, así que
   es solo UI de Pluryfact.
2. **Copias por bandeja** (emitidos: cliente + archivo). Igual que la nota 1.
3. **Año completo con «Imprimir directo»:** con más de 50 documentos Pluryfact
   pide confirmación en el botón; en el envío automático abre Pluryprint.
4. **Estado de vuelta (`jobStatus`).** Hoy el handoff no devuelve el lote de la
   cola; Pluryfact solo sabe «entregado a Pluryprint». Fase siguiente: un tipo
   `jobStatus` con el `jobId` como id de correlación guardado en la cola de
   Pluryprint, para mostrar en Descargas «Impreso», «Falló la impresora» o
   «Pendiente», y en el resumen copiable.
5. **Rango de páginas** no tiene sentido para un lote de cientos de comprobantes
   distintos. En `configure` el usuario puede fijarlo en Print Job si quiere.
6. **CLI `print --json`** imprime sin ventana y sin pasar por la cola de la GUI:
   dos caminos con comportamientos distintos. El host usa solo el handoff. El
   CLI sigue disponible por separado para quien descomprima el ZIP.
7. **Nuevo con la integración:** Pluryprint aprende a imprimir XML de
   comprobantes desde el Explorador o el Finder, «Abrir con» y arrastrar, sin
   Pluryfact (ver la ADR de Pluryprint).
8. **Actualizaciones:** el saludo negocia versión y capacidades; si Pluryprint
   es viejo o no tiene el host, Pluryfact dice «Actualiza Pluryprint» con
   enlace. El actualizador de Pluryprint no cambia.
9. Ya funciona hoy sin integración, con los archivos sacados del ZIP a mano.
10. Pluryprint no abre ZIP (riesgos de la opción a). Lo cubre «Imprimir un ZIP…».
11. **Pausar, cancelar o reintentar desde Pluryfact:** descartado en el MVP;
    se hace en la cola de Pluryprint. Con `jobStatus` podría añadirse
    «Cancelar en Pluryprint» (fase siguiente).
12. Reanudar arma otro ZIP solo con lo que faltó: se imprime solo eso. Avisar si
    algo de ese lote ya se imprimió (deduplicación por clave) es fase siguiente.
13. Marcar en Descargas qué lotes ya se imprimieron depende de la nota 4.
14. «Repetir» conserva la casilla «Enviar a Pluryprint al terminar».
15. El resumen copiable incluye la línea del envío a Pluryprint.
16. Una descarga cancelada o cortada **no** se envía sola; se puede imprimir a
    mano lo que se alcanzó a bajar.
17. Notificación del sistema al entregar o al fallar el envío: fase siguiente
    (hoy se ve en la tarjeta y en Descargas).
18. El registro anota los envíos (conteos, acción, códigos de error, versión del
    host), sin nombres ni contenido.
19. Borrar todos los datos borra también los ajustes de Pluryprint; el permiso
    se quita con «Desconectar».

### Operaciones nuevas que habilita la integración

| Operación | Fase |
|---|---|
| Imprimir XML de comprobantes desde el Explorador/Finder, «Abrir con» o arrastrando, sin Pluryfact | MVP (Pluryprint 0.0.6) |
| Imprimir solo XML: descarga más rápida, sin paginar el portal para el RIDE | MVP |
| Reimprimir una descarga pasada desde Descargas («Imprimir su ZIP…») | MVP |
| Imprimir el último resultado sin tocar el disco | MVP |
| Etiqueta «Desde Pluryfact» en Print Job y en la cola de Pluryprint | MVP (Pluryprint) |
| Estado del trabajo de vuelta en Pluryfact (`jobStatus` con id de correlación) | Siguiente |
| Hoja separadora por periodo (mes o día) y portada con totales del reporte | Siguiente |
| Deduplicación: avisar si un comprobante ya se imprimió | Siguiente |
| Perfil, impresora y copias por bandeja | Siguiente |
| Imprimir solo los fallidos de un lote, o solo un emisor de un ZIP | Siguiente |
| Notificación del sistema al entregar o al fallar | Siguiente |
| Linux y Edge Add-ons | Descartado por ahora (no se promete) |

## 9. Pruebas

| Tipo | Archivo | Qué cubre |
|---|---|---|
| Unit | `test/pluryprint.test.ts` | Saludo, versión incompatible, host no instalado, troceo exacto en los límites, sha256 y base64, abort al desconectar, cancelación, tiempos límite, respuestas incoherentes. |
| Contrato | `test/pluryprint-contrato.test.ts` | Fixtures del protocolo; igualdad byte a byte con `../pluryprint` si está. |
| Unit | `test/puente-pluryprint.test.ts` | Remitentes, forma de peticiones, permiso, cierres en ambos sentidos, registro sin contenido. |
| fakeBrowser | `test/pluryprint-navegador.test.ts` | Permiso opcional y cableado del background (`onConnect` → `connectNative`, `lastError`). |
| Unit | `test/seleccion-impresion.test.ts` | Qué y en qué orden, rutas hostiles, ZIP, textos. |
| Unit | `test/ajustes-pluryprint.test.ts` | Defectos, migración desde la 0.1.0 y formas viejas, regla de 50 documentos. |
| DOM | `test/formulario-pluryprint.test.ts` | La casilla de Nueva descarga y los formatos que fija. |
| E2E | `bun run e2e:pluryprint` | Chromium real + host nativo (falso, o el puente real de Pluryprint con `PLURYPRINT_BRIDGE_BIN`): no instalado, conectar, «Imprimir un ZIP…» con un ZIP ficticio y verificación de lo recibido (orden, tipo y sha256). Con el puente real: dos trabajos (RIDE con XML de respaldo + reporte, y solo XML + reporte), cada archivo del `inbox/` igual byte a byte a su entrada del ZIP, el handoff, y el test `bridge_handoff_e2e` de Pluryprint sobre lo que dejó el puente. |
| E2E (registro real) | `PLURYPRINT_REGISTRO=cli bun run e2e:pluryprint` | Lo anterior, pero el host lo registra `pluryprint-cli bridge install --browser chrome --extra-origin <id de prueba>` en un HOME temporal (macOS y Linux). |

### 9.1 E2E cruzada con Pluryprint

Se corre desde este repo contra los binarios reales de Pluryprint (rama
`feat/pluryfact-bridge`, que ya incluye la impresión de XML de
`feat/print-sri-xml`). No imprime en papel ni abre la app: el puente corre con
`PLURYPRINT_BRIDGE_NO_LAUNCH=1`, que escribe el inbox y el handoff y se detiene.

```sh
# En ../pluryprint/src-tauri
cargo build --bin pluryprint-bridge --bin pluryprint-cli
# Aquí: manifiesto escrito por el script, datos del puente en una carpeta temporal
PLURYPRINT_BRIDGE_BIN=../pluryprint/src-tauri/target/debug/pluryprint-bridge \
  PLURYPRINT_BRIDGE_NO_LAUNCH=1 bun run e2e:pluryprint
# Registro real con el CLI de Pluryprint, en un HOME temporal
PLURYPRINT_REGISTRO=cli PLURYPRINT_BRIDGE_BIN=../pluryprint/src-tauri/target/debug/pluryprint-bridge \
  PLURYPRINT_BRIDGE_NO_LAUNCH=1 bun run e2e:pluryprint
```

Qué comprueba, en orden:

1. **Registro** (`PLURYPRINT_REGISTRO=cli`): copia `pluryprint-cli` y
   `pluryprint-bridge` juntos a la carpeta temporal (fuera de `~/Documents`, por
   el permiso de privacidad de macOS) y corre `pluryprint-cli bridge install
   --browser chrome --extra-origin chrome-extension://<id>/ --json` con
   `HOME=<temporal>/home`; `bridge status --json` tiene que dar Chrome
   registrado, apuntando a ese puente y con el binario presente. El perfil de
   Chromium es la carpeta de Chrome de ese HOME, así que el navegador lee el
   manifiesto justo donde lo escribió el CLI, y le pasa ese HOME al puente, que
   acepta el origen de prueba solo porque el manifiesto instalado lo lista. Al
   final, el manifiesto de Chrome y el inbox de Pluryprint del usuario tienen
   que seguir iguales. Sin la variable, el script escribe el manifiesto y usa
   `PLURYPRINT_BRIDGE_DATA_DIR`.
2. **Protocolo y página**: «no instalado» antes de registrar, `hello`,
   `listProfiles`, y dos «Imprimir un ZIP…» del ZIP ficticio (RUC
   0999999999001): «Se imprimirán 3 RIDE + 1 XML + el reporte.» y, tras elegir
   «El XML» en Avanzado, «Se imprimirán 4 XML + el reporte.» (una es una
   retención).
3. **Inbox y handoff** de cada trabajo: cada archivo de `inbox/<jobId>/` es byte
   a byte su entrada del ZIP (comparado contra el ZIP descomprimido, no contra
   lo que se usó para armarlo), en orden de impresión; el handoff
   `pluryfact-<jobId>.json` dice `schema_version: 1`, `source: "pluryfact"`,
   `action: "configure"`, la etiqueta «Recibidos · 2026-10» (sin RUC) y las
   rutas del inbox en orden.
4. **Lo que haría la app**: si encuentra el repo de Pluryprint (el `src-tauri`
   del que salió `PLURYPRINT_BRIDGE_BIN`, o `PLURYPRINT_SRC_TAURI`), compila
   antes de abrir Chromium su test `bridge_handoff_e2e` y lo corre justo después
   de cada trabajo (la app no acepta un handoff de más de 60 s). Ese test arma
   la línea de comandos con la que el puente abre la app, la pasa por la misma
   puerta del menú contextual (`cli::selection_from_at`), comprueba que con el
   HOME temporal la carpeta de handoff de la app es la del puente, que Print
   Job da los 5 archivos por imprimibles (`ipc::jobs::inspect_files`) y
   convierte cada uno con el proceso de render real (`convert_to_pdf`): los PDF
   pasan tal cual, cada XML sale como su representación tipo RIDE y el reporte
   como página de texto. Los PDF quedan en `<temporal>/impreso/<jobId>/` con
   `E2E_CONSERVAR=1`. `PLURYPRINT_VALIDAR_HANDOFF=0` salta este paso.

Verificado en esta Mac (14 de noviembre de 2026, Pluryprint
`feat/pluryfact-bridge` en de47ae8): pasan los tres modos (host falso; puente
real con manifiesto del script; puente real registrado con
`pluryprint-cli bridge install` en un HOME temporal), con todas las
comprobaciones en PASS, incluidos los dos trabajos por la puerta de la app y la
conversión de los 4 XML (factura y retención) y del reporte a PDF. El
manifiesto `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
y el inbox de Pluryprint del usuario no cambiaron.

Una observación de esa corrida: el pie de la representación impresa sale en el
idioma de la app de Pluryprint (`app.locale`). En un HOME nuevo, sin el primer
arranque que detecta el idioma del sistema, es inglés («Printed representation
generated by Pluryprint…»); con la app ya configurada en español sale
«Representación impresa generada por Pluryprint…». Las etiquetas del RIDE van
siempre en español.

Lo que no cubre: abrir de verdad la pantalla Print Job con el handoff
(`PLURYPRINT_BRIDGE_NO_LAUNCH=0` con la app instalada), mandar a una cola de
impresión (aunque sea una PDF virtual), Edge y Brave, y Windows (registro en
HKCU y el instalador NSIS), que no se puede probar desde esta Mac.

Pendiente de probar a mano: el flujo con la pestaña real del SRI (resultado en
memoria y envío al terminar), la apertura de la app desde el puente instalado
en Windows y macOS, el registro en Windows, y una impresora o PDF virtual de
verdad. Windows no se puede probar desde esta Mac.

## 10. Versiones y publicación

1. Chrome Web Store aprueba **Pluryfact 0.1.0** (en revisión; no se toca).
2. **Pluryprint 0.0.6** sale con `pluryprint-bridge`, el registro del host y la
   impresión de XML: las dos ramas (#104 y #103) juntas, ver §9. Sin la segunda,
   lo que Pluryfact mande como XML llega pero Pluryprint no lo imprime.
3. **Pluryfact 0.2.0** se envía a la tienda con el permiso opcional y la
   pestaña de privacidad actualizada (`store-assets/PRIVACY-0.2.0-borrador.md`).
   El permiso nuevo puede alargar la revisión.
4. Las landings dicen «En desarrollo» hasta entonces.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| La revisión de la tienda tarda más por `nativeMessaging` o la lee como segunda finalidad | Permiso opcional; finalidad redactada como «descargar… y entregarlos a la app de escritorio del usuario para imprimirlos». |
| Políticas de empresa bloquean hosts de usuario | Se ve como «no instalado»; documentado. |
| macOS: Gatekeeper/cuarentena o App Translocation | La app registra solo desde una ruta estable y en cada arranque; hay que abrirla una vez. |
| Lotes muy grandes (miles de RIDE) | Límites del host, troceo, avance visible y «Detener»; memoria: el ZIP ya vivía en memoria de la pestaña. |
| El service worker se duerme a mitad | El puerto nativo lo mantiene vivo; si muere, el puerto se cierra, el host descarta el trabajo y Pluryfact dice «Pluryprint cerró la conexión». |
| Papel gastado por error | `configure` por defecto y confirmación con más de 50 documentos. |
