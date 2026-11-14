# Pluryfact: investigación UI/UX de descargas masivas y propuesta de mejoras

## 1. Resumen

- **Hallazgo principal:** ninguna extensión del SRI (ni de descargas en lote en general) ofrece una página completa como chrome://downloads. Casi todas inyectan UI en el portal o usan solo un popup. Tener esa página sería un diferenciador claro.
- **Modelo a seguir:** el de Chrome y de Chrono, en dos niveles. El popup actúa como "burbuja" con el estado del trabajo activo y la página `pluryfact.html` en pestaña es el gestor (Nueva descarga, Descargas, Avanzado, Acerca de).
- **Queja más grave del sector:** descargas incompletas sin explicación ("101 facturas" y solo 11 XML descargados). Le siguen los errores sin causa y los ajustes que no se recuerdan. Pluryfact debe mostrar cuántos comprobantes esperaba y cuántos obtuvo, y dar errores que se puedan resolver.
- **"Puedes cerrar" tiene un matiz:** el popup se puede cerrar, pero la pestaña del SRI no. Hay que decir ambas cosas y apoyarlas con la insignia del icono y notificaciones del sistema.
- **Confianza demostrada, no solo prometida:** "no pedimos tu clave", "nada sale de tu navegador", permisos explicados uno por uno, código y política enlazados, e identidad MAECLY. Varios competidores declaran que recogen datos de autenticación e historial web.

## 2. Qué hace la competencia

| Producto | Superficie de UI | Fortalezas | Debilidades / quejas |
|---|---|---|---|
| XML Manager (Tribuexcel), líder SRI, unos 3.000 usuarios, 4,9★ | Inyectada en el portal más web del proveedor | Carpetas por contribuyente/año/mes; TXT+PDF de un mes completo; advierte "no tienen validez tributaria"; soporte humano (WhatsApp, oficina en Quito) | Declara que recoge "información de autenticación" y "contenido del sitio" |
| Descargador Masivo SRI | Botón inyectado que abre "ventana segura" | "No requiere ingresar la contraseña del SRI" | Sin capturas ni detalle público de su UI |
| ACCOUNTEX365 | Inyectada en "Comprobantes recibidos" | Muestra el estado del servicio SRI (producción/pruebas); permite elegir registros | Piden mejor estructura de carpetas; se rompe si cambia el DOM del SRI |
| FREC SRI | Inyectada, "un clic" | Captura todos los XML visibles | Envía los datos a su plataforma; recoge datos de autenticación |
| DaatSRI | Extensión más web del proveedor | Organiza en subcarpetas; dashboards en la web | Declara recoger "historial web"; cifras de marketing sin método ("+500/min") |
| ExcelContable | Extensión | "No solicita ni almacena credenciales" | — |
| Descarga Masiva Facturas (SAT) | Extensión | — | Descarga incompleta sin aviso (11 de 101 XML, 3 de 40 PDF) |
| DownThemAll! | Diálogo de selección, Manager (pestaña o ventana) y Preferencias, con una tabla compartida | Máscaras de renombrado, filtros reutilizables, cola con límites | "Terrible documentation and terrible UI", "no help, no text", errores de validación que no dicen qué campo falla, "closing the manager stopped all downloads" |
| Simple Mass Downloader | Popup con pestañas | Pausar/reanudar/reintentar, colas activa y pasiva, máscaras de nombre, carpetas favoritas | "Error handling is non existent", "doesn't retain its settings", duplicados nombrados "(1), (2)" |
| Image Downloader | Popup | Filtros, quitar duplicados, subcarpeta y renombrado | Abre un diálogo de guardado por archivo si no hay carpeta por defecto |
| Chrono Download Manager (unos 800 mil usuarios) | Popup más gestor en pestaña (Ctrl+J) | Vista de lista o tabla, filtros personalizables, búsqueda instantánea | Las fuentes no coinciden en si el gestor es pestaña o ventana |
| Chrome (burbuja + chrome://downloads) | Icono y bandeja, más página completa | Dos niveles; acciones según el estado; aclara "se quita de la lista, no del equipo"; avisos dentro de la fila | — |
| Firefox (panel + Biblioteca) | Panel más ventana | Botón de carpeta al terminar; avisos en el panel | El mismo ítem se comporta distinto según la vista; acciones que fallan sin avisar si el archivo ya no existe |
| Motrix / Motrix Next, FDM, AriaNg, JDownloader 2 | Aplicación de escritorio o web | Filtros por estado con contador; historial persistente; orden por columnas; reintento automático por tipo de error; paquetes con hijos; ETA y velocidad agregadas | — |
| uBlock Origin / OneTab / Bitwarden | Popup más página completa o ventana | uBO tiene un Dashboard en pestaña con Soporte separado; OneTab exporta/importa y aclara qué sube; Bitwarden añadió un botón "pop out" | El popup de Bitwarden se cierra al perder el foco ("can't control"), algo que los usuarios piden resolver una y otra vez |

## 3. Patrones de la industria a adoptar

### Página completa y navegación
- **Dos niveles, como Chrome y Chrono.** El popup muestra el estado y lleva un botón "Abrir Pluryfact". La página completa en pestaña (`pluryfact.html`, abierta con `tabs.create` y declarada también como `options_page`) tiene navegación lateral: Nueva descarga · Descargas · Avanzado · Acerca de.
- **El popup no aloja el trabajo.** Chrome lo cierra al perder el foco. El estado vive en `chrome.storage.local` y todas las vistas escuchan `storage.onChanged`, sin sondeo ni mensajes.
- **Nueva descarga a pantalla completa en dos columnas.** A la izquierda, los parámetros. A la derecha, un resumen con estimación ("≈ 3.600 archivos, unos 40 min") y la comprobación de que hay sesión activa en el SRI.
- **Panel lateral (`sidePanel`) opcional** para ver el portal y el progreso a la vez. Solo se abre tras un gesto del usuario y no sustituye a la página.

### Lista de descargas e historial
- **Al estilo chrome://downloads:** buscador arriba, trabajos agrupados por fecha (Hoy / Ayer / Anteriores) y una fila por trabajo con contribuyente o RUC, tipo, periodo y una línea de estado. La barra aparece solo mientras el trabajo está en curso.
- **Acciones según el estado.** Mientras corre: Pausar/Reanudar (un solo botón que cambia de texto) y Cancelar. Al terminar: Mostrar en carpeta (`chrome.downloads.show`), Reintentar fallidos, "Repetir con los mismos filtros" y un menú "⋯" con Quitar y Copiar resumen.
- **Paquetes al estilo JDownloader.** El trabajo es el padre y los 12 meses son sus hijos. El fichero de periodos actual pasa a ser el detalle expandido de la fila.
- **Filtros por estado con contador** ("Todas · En curso · Con errores · Completadas") y búsqueda por RUC, razón social o periodo.
- **Historial persistente** que sobrevive a reinicios (como Motrix Next), con un botón "Limpiar completadas".

### Progreso y estados
- **Pasos además del porcentaje (NN/g).** Por ejemplo "Marzo · RIDE 87 de 152". La barra mide el trabajo total, no el paso actual (GNOME HIG).
- **Primero indeterminado, luego determinado.** Mientras no se conoce el total, "Contando comprobantes…"; después, la barra con porcentaje, sin alternar entre los dos modos. Si no hay avance en más de 30 s, mostrar "Esperando respuesta del SRI…" en vez de dejar la barra congelada.
- **ETA suavizado y redondeado.** Media exponencial con alfa ≈ 0,3, mostrado solo tras unos 20 archivos, en rango ("unos 10–15 min") y oculto si el trabajo está pausado o la sesión caducó. El ritmo se expresa en comprobantes/min, no en MB/s.
- **Estados como adjetivos, al estilo GOV.UK:** Pendiente, En curso, Pausado, Sesión caducada, Hay un problema (n), Completado. "Completado" va en texto plano para que destaque lo que requiere acción, y ningún estado depende solo del color.

### Segundo plano y "puedes cerrar"
- **Línea fija con icono mientras corre el trabajo:** "Puedes cerrar esta ventana: la descarga sigue. No cierres la pestaña del SRI ni cierres sesión." Repetirla en el tooltip (`setTitle`).
- **Insignia del icono (unos 4 caracteres):** "37%" o "4/12" en azul durante la descarga, "!" en ámbar si se requiere acción y "✓" en verde al terminar, que se limpia al abrir la extensión. Sin iconos animados.
- **Notificaciones del sistema solo en tres momentos:**
  - al terminar, con "Abrir ZIP" y "Ver detalles";
  - cuando la sesión caduca, con `requireInteraction` y "Ir al SRI";
  - ante un error.
  
  No se notifica cada mes. En macOS los botones no muestran iconos.
- **Aviso al usuario si cierra la pestaña del portal**, mediante `beforeunload` o una notificación.

### Errores, reintento y reanudar
- **El error va dentro de la fila (como Chrome y Firefox), nunca solo en un toast.** Debe dar la causa en lenguaje claro y una acción: "La sesión del SRI caducó en Marzo, página 3 → Inicia sesión y pulsa Reanudar".
- **Comparar lo esperado con lo obtenido** por mes y tipo ("148 de 150 · 2 fallidos → Reintentar"), con una lista exportable de los faltantes por clave de acceso.
- **Reintento automático por tipo de error** (FDM) y "Reintentar este mes".
- **Ocultar o deshabilitar las acciones que ya no aplican**, para no dejar botones que fallen sin avisar (bugs de Firefox).
- **Cierre inequívoco** con un banner de éxito que resuma el resultado ("1.784 archivos · 12 meses · 3 sin RIDE"), "Abrir ZIP" como acción principal y "Ver detalle" como secundaria. Así el usuario no relanza el trabajo.

### Ajustes avanzados
- **Plantilla de nombres con vista previa en vivo.** ZIP: `Pluryfact_<RUC>_<desde>-<hasta>.zip`. Archivos: `{tipo}_{serie}_{fecha}_{ruc}`. Carpetas dentro del ZIP: contribuyente/año/mes, por tipo, o plana.
- **Opciones de salida:** qué hacer con los duplicados (omitir o reemplazar); un ZIP por mes o uno solo; incluir el reporte TXT y un CSV resumen.
- **Ritmo "amable con el SRI":** pausa entre peticiones (lento/normal), concurrencia de 1 a 3 y reintentos automáticos.
- **Comportamiento:** notificaciones sí/no, conservar el historial N días y panel lateral sí/no.
- **Las preferencias se recuerdan** (queja de Simple Mass Downloader), con botones para restablecerlas y para exportar/importar los ajustes en JSON.
- **Soporte:** registro de diagnóstico (.txt, sin datos sensibles) que se pueda copiar o descargar, y "Borrar todos los datos locales".
- **Recordatorio** de desactivar "Preguntar dónde guardar cada archivo" en Chrome.

### Confianza y "Acerca de"
- **Bloque de confianza en Acerca de y en la primera ejecución:**
  - "Usa tu sesión abierta del SRI; nunca pide tu clave."
  - "Todo ocurre en tu navegador: Pluryfact no tiene servidores ni analítica y no envía comprobantes ni credenciales."
- **Permisos en una tabla**, cada uno con el motivo en español. Incluir la declaración de cumplimiento Limited Use: la política exige describir el uso de datos "in the extension's interface".
- **Pruebas, no solo promesas.** La ficha de privacidad de la Chrome Web Store es autodeclarada y nadie la audita, así que hay que enlazar el código fuente y la política de privacidad.
- **Identidad y soporte:** versión con fecha de compilación y Novedades, licencia, "Reportar un problema" (adjunta el diagnóstico), contacto (correo o WhatsApp), crédito "by MAECLY" con el kit de marca y la frase "No es una herramienta oficial del SRI".
- **Estado del portal SRI en la cabecera** (sesión activa o caducada, portal disponible), como hace ACCOUNTEX365.
- **Bienvenida con `runtime.onInstalled`:** abre la página en tres pasos (inicia sesión en el SRI → elige el periodo → descarga).
- **Separar Avanzado de Soporte/Acerca de**, como el Dashboard de uBO.

## 4. Anti-patrones a evitar

- **Terminar en silencio con menos archivos de los esperados.** Es la queja nº 1 (11 de 101).
- **Errores genéricos o que no dicen qué campo falla** ("Renaming Mask invalid" cuando el campo estaba vacío).
- **Olvidar los ajustes entre lotes.**
- **Que cerrar una vista detenga las descargas** (DownThemAll), o no aclarar qué se puede cerrar y qué no.
- **Depender del popup para un trabajo largo.** El popup se cierra al perder el foco (Bitwarden).
- **Indicadores estáticos** como "Cargando…" o "Por favor espere", una barra congelada, una barra que llega al 100 % antes de terminar o que salta, y ETA exactos que oscilan ("4 min 37 s").
- **Usar un toast como único registro**, o prometer un aviso que nunca llega.
- **Comportamiento distinto del mismo ítem según la vista**, y acciones que fallan sin avisar.
- **Notificar en exceso** (cada mes) o usar iconos animados en la barra.
- **Nombres genéricos de archivo** como `export(3).zip`, o duplicados "(1), (2)".
- **Un diálogo de guardado por archivo.**
- **Prometer privacidad sin pruebas**, o pedir permisos de más (webRequest y cookies se marcan como "medium risk").
- **Cifras de marketing sin método** ("+500 comprobantes/minuto").
- **Interfaz sin ayuda ni texto** ("no help, no text").

## 5. Recomendaciones priorizadas para Pluryfact

### P0 (núcleo de la petición y de la confianza)

1. **Página completa `pluryfact.html` en pestaña** con navegación lateral (Nueva descarga · Descargas · Avanzado · Acerca de). El popup queda como resumen del trabajo activo con un botón "Abrir Pluryfact".
   - *Por qué:* el popup se cierra solo, los trabajos duran de 10 a 60 min, y ningún competidor del SRI tiene una página así.
   - *Fuente:* developer.chrome.com (add-popup, options-page); Chrono; uBlock Origin.
2. **Estado compartido en `storage.local` y `storage.onChanged`** para que el popup, la página y un eventual panel se mantengan sincronizados y se pueda reanudar.
   - *Por qué:* es la base técnica de todo lo demás.
   - *Fuente:* Chrome storage API; hilo chromium-extensions.
3. **Aviso "Puedes cerrar esta ventana: la descarga sigue. No cierres la pestaña del SRI"** con icono, en el popup y en la página, repetido en `setTitle`.
   - *Por qué:* es la duda exacta que llevó a quejas contra DownThemAll, y el matiz de la pestaña del SRI es la condición que el usuario de verdad no debe romper.
   - *Fuente:* reseña de DownThemAll (Thunderbird); Outline; Chrome action API.
4. **Comparación de esperados y obtenidos** por mes y tipo, con "Reintentar fallidos" y una lista exportable de los faltantes.
   - *Por qué:* es la queja más grave del sector.
   - *Fuente:* reseñas de Descarga Masiva Facturas (AMO).
5. **Errores dentro de la fila con causa y acción** ("Sesión caducada en Marzo, pág. 3 → Reanudar"); las acciones que no aplican se ocultan.
   - *Fuente:* reseñas de Simple Mass Downloader y DownThemAll; item.html.ts de Chromium; bugs 1739150 y 227502 de Mozilla.
6. **Descargas al estilo chrome://downloads:** agrupadas por fecha, buscador, acciones según el estado y "Quitar del historial de Pluryfact (no borra archivos de tu computadora)". El fichero de periodos pasa a ser el detalle expandido.
   - *Fuente:* support.google.com/chrome/answer/95759; item.html.ts.
7. **Insignia del icono** ("4/12", "!" ámbar, "✓" verde) y **notificaciones** al terminar, al caducar la sesión (con `requireInteraction`) y ante errores.
   - *Por qué:* el usuario habrá cerrado el popup.
   - *Fuente:* Chrome action y notifications API.
8. **Acerca de con bloque de confianza:** no pide la clave, todo en el navegador, tabla de permisos, Limited Use, versión, enlaces a código y privacidad, contacto, by MAECLY y "No es una herramienta oficial del SRI".
   - *Por qué:* los competidores recogen datos de autenticación e historial, y la ficha de la Chrome Web Store no está auditada.
   - *Fuente:* user-privacy y limited-use (developer.chrome.com); blog.google; fichas de XML Manager, DaatSRI y ExcelContable.

### P1 (calidad de la experiencia)

9. **Progreso honesto:** primero indeterminado ("Contando comprobantes…") y luego determinado; frase de paso ("RIDE 87 de 152 · marzo"); barra ponderada por el total; "Esperando respuesta del SRI…" si pasan más de 30 s sin avance.
   - *Fuente:* NN/g (progress-indicators, response-times); GNOME HIG; Apple HIG (página no cargada, verificar).
10. **ETA en rango y suavizado**, mostrado tras unos 20 archivos y oculto si está pausado o caducado; ritmo en comprobantes/min.
    - *Fuente:* codemia, progressbar-2, engineered.at; NN/g.
11. **Pestaña Avanzado:**
    - plantillas de nombre y carpetas con vista previa (contribuyente/año/mes);
    - duplicados;
    - ZIP por mes o único, TXT y CSV resumen;
    - ritmo y concurrencia, reintentos automáticos, notificaciones sí/no;
    - recordar, restablecer, exportar/importar ajustes, diagnóstico .txt y "Borrar datos locales".
    - *Fuente:* XML Manager, DownThemAll, Simple Mass Downloader, FDM, AriaNg, OneTab.
12. **Estados de mes al estilo GOV.UK**, como adjetivos y sin depender solo del color, más un banner de éxito final con "Abrir ZIP".
    - *Fuente:* design-system.service.gov.uk (complete-multiple-tasks, notification-banner); saasui.design.
13. **Filtros por estado con contador** y búsqueda por RUC, razón social o periodo.
    - *Fuente:* Motrix/Motrix Next, Chrono, AriaNg.
14. **Estimación y comprobación de sesión antes de iniciar** en Nueva descarga, con ayudas de una línea.
    - *Fuente:* recomendación de los informes sobre la base de la crítica "no help, no text" a DownThemAll; ACCOUNTEX365 (estado del SRI).

### P2 (diferenciadores adicionales)

15. **Bienvenida en la primera ejecución** (`runtime.onInstalled`) con tres pasos.
    - *Fuente:* informe paginas-extension (Chrome options-page / patrón de onboarding).
16. **Panel lateral opcional**, activable en Avanzado, que se abre solo tras un clic del usuario.
    - *Fuente:* Chrome sidePanel API.
17. **Atajo de teclado** para abrir Pluryfact (como Ctrl+J en Chrono) y "Repetir con los mismos filtros".
    - *Fuente:* Chrono.
18. **Indicador del estado del portal SRI** en la cabecera.
    - *Fuente:* ACCOUNTEX365.
19. **Exportar e importar el historial.**
    - *Fuente:* OneTab; informe gestores-descargas.

## 6. Fuentes

- https://github.com/downthemall/downthemall
- https://www.techspot.com/downloads/4871-downthemall.html
- https://addons.mozilla.org/en-US/firefox/addon/downthemall/
- https://addons.mozilla.org/en-US/firefox/addon/downthemall/reviews/?score=1
- https://services.addons.thunderbird.net/It/thunderbird/addon/downthemall/reviews/?page=42
- https://chromewebstore.google.com/detail/simple-mass-downloader/abdkkegmcbiomijcbdaodaflgehfffed
- https://www.scribd.com/document/634380629/SMD-Quick-Start
- https://addons.mozilla.org/en-US/firefox/addon/simple-mass-downloader/reviews/
- https://chromewebstore.google.com/detail/image-downloader/cnpniohnfphhjihaiiggeabnkjhpaldj
- https://extscope.org/extension/doifmajcjkegfocdckoelpojekgjjlmg
- https://www.extscope.org/extension/coggdlbgdgdjdeaelcfobaekdeadkifm
- https://chromewebstore.google.com/detail/frec-sri/ppjlbimpmbjhiaemikjgnidgbnnokhbd
- https://chromewebstore.google.com/detail/xml-bot/gbkbepicfihgbemoajgahpmaljcffjkm
- https://chromewebstore.google.com/detail/gokjdojamjphhhfjcbddamnnlbodipko
- https://addons.mozilla.org/es-ES/firefox/addon/excelcontable/
- https://productos.tribuexcel.com
- https://daatsri.com
- https://addons.mozilla.org/en-GB/firefox/addon/descarga-masiva-facturas/reviews/
- https://support.google.com/chrome/answer/95759
- https://winaero.com/restore-download-panel-google-chrome
- https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/resources/downloads/item.html.ts
- https://support.mozilla.org/kb/find-and-manage-downloaded-files
- https://bugzil.la/1739150
- https://bugzilla.mozilla.org/show_bug.cgi?id=227502
- https://www.ghacks.net/?p=169505
- https://www.pclosmag.com/html/Issues/202107/page04.html
- https://newreleases.io/project/github/AnInsomniacy/motrix-next/release/v3.5.0
- https://www.videohelp.com/software/Free-Download-Manager-/version-history
- https://pclosmag.com/html/Issues/202212/page06.html
- https://github.com/iooxxox/AriaNg/blob/master/README.md
- https://www.softpedia.com/progChangelog/JDownloader-Changelog-120631.html
- https://forums.aida64.com/topic/3065-jdownloader-values/
- https://microsoftedge.microsoft.com/addons/detail/chrono-download-manager/klnjihiihbjoehcifggognefbkkfpfhj
- https://www.softpedia.com/get/Internet/Internet-Applications-Addons/Chrome-Extensions/Chrono-Download-Manager.shtml
- https://chrome.google.com/webstore/detail/chrono-download-manager/mciiogijehkdemklbdcbfkefimifhecn
- https://community.chocolatey.org/packages/chrono-chrome
- https://malwaretips.com/threads/chrono-download-manager.41820/
- https://www.chromeboard.com/extension/chrono-download-manager-mciiogijehkdemklbdcbfkefimifhecn
- https://www.nngroup.com/articles/progress-indicators/
- https://www.nngroup.com/articles/response-times-3-important-limits/
- https://developer.apple.com/design/human-interface-guidelines/progress-indicators
- https://designsystem.emarsys.net/docs/components/progress/guidelines/
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/fIE3ayFz2Z8
- https://extension.js.org/docs/workflows/manage-downloads
- https://codemia.io/knowledge-hub/path/smart_progress_bar_eta_computation
- https://progressbar-2.readthedocs.io/en/latest/widgets/smoothing-eta.html
- https://engineered.at/articles/progress-bars-are-surprisingly-difficult
- https://git.stg.centos.org/source-git/gnome-devel-docs/raw/1470ead63cdc56c84b491edf46f35990ec57fc33/f/hig/C/progress-bars.page
- https://www.saasui.design/blog/saas-data-export-download-ux-patterns
- https://igit.yuuza.net/yuuza/outline/commit/8e1f42a9cb2294c39a432cfedf79663e96ab6be1
- https://redactbox.featurebase.app/changelog/background-export-processing-and-real-time-task-tracking
- https://help.assessmentq.com/en/articles/391168-where-do-i-find-the-reports-i-exported
- https://design-system.service.gov.uk/patterns/complete-multiple-tasks/
- https://design-system.service.gov.uk/components/notification-banner/
- https://developer.chrome.com/docs/extensions/reference/api/action
- https://developer.chrome.com/docs/extensions/reference/api/notifications
- https://www.neowin.net/news/google-chrome-downloads-bar-to-be-replaced-by-animated-toolbar-button-and-flyout
- https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy
- https://blog.google/products/chrome/making-chrome-extensions-more-private-and-secure/
- https://www.superchargebrowser.com/library/chrome-web-store-privacy-rules-august-2026/
- https://developer.chrome.com/docs/extensions/develop/ui/add-popup
- https://developer.chrome.com/docs/extensions/develop/ui/options-page
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://github.com/gorhill/uBlock/wiki/Dashboard:-My-filters
- https://lists.dyne.org/lurker/message/20230616.180311.0ea7d128.hu.html
- https://wikiwiki.jp/firefox/Ext/bars/OneTab
- https://one-tab.com
- https://community.bitwarden.com/t/bitwarden-extension-popup-disappears-when-switching-away-from-browser-window/35261
- https://developer.chrome.com/docs/webstore/program-policies/limited-use

**Límites de la investigación:**
- Las fichas de la Chrome Web Store se obtuvieron sin capturas ni texto de reseñas, así que las quejas vienen de AMO y de agregadores.
- La página de Apple HIG no cargó.
- La anatomía visual de chrome://downloads (buscador, agrupación por fecha) se describe por observación directa, sin fuente citada.

---
_Investigación del 2026-11-10: 4 agentes en paralelo (extensiones de descarga masiva, gestores de descargas, tareas largas en segundo plano, páginas de extensión) y una síntesis. Fuentes al final._
