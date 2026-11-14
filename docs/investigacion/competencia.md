# Competencia: descarga en lote de comprobantes del SRI

**Fecha:** 2026-11-13
**Objetivo:** ver qué existe hoy para descargar en lote comprobantes electrónicos (recibidos y emitidos) desde SRI en Línea, para preparar la tabla comparativa de la landing de Pluryfact.

> Regla de esta investigación: solo se anota lo que consta en una fuente citada. Si un dato no aparece en la fuente, se escribe «no consta». No se instaló ni se probó ningún producto; todo sale de fichas públicas (Chrome Web Store, Firefox Add-ons, agregadores de fichas, READMEs de GitHub y webs de los proveedores).

## Metodología

- **Búsquedas web** (motor general): «extensión Chrome descargar comprobantes electrónicos SRI XML masivo», «chromewebstore.google.com SRI comprobantes recibidos descarga», «descarga masiva comprobantes recibidos SRI software Ecuador sincronización automática», «programa descargador XML SRI escritorio descarga masiva comprobantes recibidos Excel», «software contable Ecuador "comprobantes recibidos" importación automática desde el SRI clave SRI», «Contífico comprobantes recibidos SRI descarga automática compras», «Contífico "documentos electrónicos recibidos"…», «Alegra Ecuador descargar comprobantes recibidos SRI…», «Dátil facturación Ecuador comprobantes recibidos SRI…», «Leviatán extensión SRI…».
- **GitHub** (`gh search repos`): «sri descarga masiva», «sri comprobantes recibidos», «comprobantes recibidos sri», «sri-downloader», «srienlinea», «sri xml descarga», «sri ecuador scraper/selenium/playwright», etc. Se leyeron los READMEs y los metadatos (licencia, último push) con `gh api`.
- **Fichas consultadas**: Chrome Web Store directamente cuando cargó; si no, los agregadores chromeboard.com y extscope.org, que copian la ficha de la tienda (se indica en cada caso).
- Fichas de tienda leídas el 2026-11-13; los números de usuarios y valoraciones son de ese día.

## Tabla resumen

| Producto | Categoría | Precio | Credenciales SRI | Formatos | Filtros | Reanuda / reintenta | Código abierto | Fuente |
|---|---|---|---|---|---|---|---|---|
| **Pluryfact** (referencia) | Extensión Chrome MV3 | Gratis | No las pide; usa tu sesión, en tu pestaña, sin servidores | XML + RIDE PDF + TXT en ZIP | Día/rango/mes/año; RUC o razón social del emisor (recibidos) | Reanuda tras caducar la sesión | Sí, AGPL-3.0 | — |
| XML Manager: Descarga automática SRI | Extensión Chrome | No consta | No consta (la ficha declara que trata «información de autenticación») | XML recibidos; TXT y PDF de reportes de emitidos; TXT de recibidos | No consta (organiza por contribuyente/año/mes) | No consta | No consta | [CWS](https://chromewebstore.google.com/detail/xml-bot/gbkbepicfihgbemoajgahpmaljcffjkm) |
| Descargador Masivo SRI (docu.ec) | Extensión Chrome + servicio web | Gratis para lo reciente; pago único para periodos largos | No pide la clave, pero **envía la cookie de sesión del SRI a los servidores de Docu** | XML y PDF; Excel en el modo extendido | Toma la consulta hecha en el portal | No consta | No consta | [CWS](https://chromewebstore.google.com/detail/doifmajcjkegfocdckoelpojekgjjlmg), [docu.ec](https://downloader.docu.ec/) |
| Accountex365 / Gestor SRI | Extensión Chrome | Se presenta como versión gratuita | Usa la sesión del portal | XML y PDF (RIDE) | No consta | No consta | No consta | [extscope](https://extscope.org/extension/coggdlbgdgdjdeaelcfobaekdeadkifm) |
| ContaBot Pro — Descarga XML SRI | Extensión Chrome | Requiere licencia (importe no consta) | Usa la sesión; «no almacena ni transmite credenciales» | XML | Año, mes, tipo de documento | Reintenta fallidas; reanudar no consta | No consta | [extscope](https://extscope.org/extension/jdceobljpdanafnbhekecmcpfgojopkd) |
| DaatSRI Descarga Masiva | Extensión Chrome | No consta | No consta | XML | No consta | No consta | No consta | [CWS](https://chromewebstore.google.com/detail/gokjdojamjphhhfjcbddamnnlbodipko) |
| FREC SRI | Extensión Chrome (envía a plataforma FREC) | No consta | No consta en la ficha; los XML se envían a la plataforma FREC | XML | Lo visible en la consulta | No consta | No consta | [CWS](https://chromewebstore.google.com/detail/frec-sri/ppjlbimpmbjhiaemikjgnidgbnnokhbd) |
| ExcelContable | Extensión Firefox | No consta | Usa tu sesión; no pide ni guarda credenciales | XML y PDF | Mes por tipo de comprobante | No consta | No («All Rights Reserved») | [AMO](https://addons.mozilla.org/en-US/firefox/addon/excelcontable/) |
| Descargador de Comprobantes SRI (rolansor) | Extensión Chrome/Edge (GitHub, sin tienda) | Gratis (código en GitHub) | Usa tu sesión | XML y PDF (RIDE), recibidos y emitidos; historial a CSV | Tipo de comprobante; emitidos por día o mes completo | Reintenta (configurable), reintentar fallidos, deduplica, guardado incremental | Código público **sin licencia declarada** | [GitHub](https://github.com/rolansor/sri-downloader-extension) |
| SRI Pro Downloader (jonavez) | Extensión Chrome (GitHub, sin tienda) | Gratis (código en GitHub) | Usa tu sesión | XML; CSV | La consulta hecha en el portal | No consta | Código público **sin licencia declarada** | [GitHub](https://github.com/jonavez/sri-pro-downloader) |
| Comprobantes SRI (CUENCOR) | App de escritorio (Windows/macOS) | De pago por equipo, prueba 7 días (importe no consta) | Opcional: modo automático guarda la clave cifrada en tu equipo; modo asistido no la guarda | XML, RIDE PDF, Excel (libros, resumen IVA), ATS | Periodo y tipo | No consta | No consta | [comprobantessri.com](https://comprobantessri.com/) |
| Descargas Documentos Digitales SRI | App de escritorio (Python, Linux/Windows) | Gratis (código en GitHub) | **Pide la clave**; opcionalmente la guarda en el llavero del sistema | XML, RIDE PDF, índice XLSX, PDF consolidado | Mes/año, tipo de comprobante | Reintenta ante «Captcha incorrecta»; omite lo ya bajado | Código público **sin licencia declarada** | [GitHub](https://github.com/BORED155/DESCARGAS-DOCUMENTOS-DIGITALES-SRI) |
| recibo.ec (CipherByte) | Servicio web | Gratis hasta 200 comprobantes/mes; planes de pago | Opcional: conectas cédula/RUC con la clave del SRI (dónde se guarda: no consta) | XML, PDF, XLSX/CSV | Fecha, proveedor, monto | No consta | No consta | [recibo.ec](https://recibo.ec/) |
| PlusFactura | Servicio web (robot) | Desde USD 9,50/mes | No consta (un «robot se conecta a la página del SRI») | Reportes Excel/PDF; comprimidos con comprobantes; ATS | No consta | No consta | No consta | [plusfactura.com.ec](https://www.plusfactura.com.ec/) |
| Tribufy (Tribu Sync) | SaaS contable + extensión Chrome | Incluida en Tribu Pro, USD 14,99/mes | No consta | No consta | No consta | No consta | No consta | [tribufy.cloud](https://tribufy.cloud/) |
| Factunexo | SaaS de facturación | No consta (prueba 14 días) | No consta | No consta | No consta | Importación «automática diaria» | No consta | [factunexo.com.ec](https://www.factunexo.com.ec/producto/comprobantes-electronicos-sri) |

Resolución automática de captcha: **ninguna fuente de esta lista afirma resolver captchas automáticamente.** La única que habla del captcha (Descargas Documentos Digitales SRI) dice que no lo salta: reintenta y, si sigue fallando, pide al usuario que pulse «Consultar».

## Fichas por producto

### 1. XML Manager: Descarga automática SRI
- **Categoría:** extensión de Chrome. Desarrollador: IDEMPRESARIAL SAS (Ecuador), web productos.tribuexcel.com.
- **Uso y estado:** 3.000 usuarios, 4,9/5 con 264 valoraciones, versión 3.4.8, actualizada el 30 sep 2026.
- **Precio:** no consta en la ficha.
- **Credenciales:** no consta cómo se autentica. En la sección de privacidad declara que trata «Authentication information».
- **Formatos:** «Asistente de descarga de archivos XML de comprobantes electrónicos recibidos»; «Descargar reportes TXT y PDF de comprobantes emitidos de hasta un mes completo»; «Descarga automática del reporte TXT de comprobantes recibidos». También descarga «extractos» XML de emitidos que, según la propia ficha, «no tienen validez tributaria».
- **Organización:** carpetas por contribuyente, año y mes de emisión.
- **Filtros, reanudar, captcha, código abierto:** no consta.
- **Fuente:** https://chromewebstore.google.com/detail/xml-bot/gbkbepicfihgbemoajgahpmaljcffjkm

### 2. Descargador Masivo SRI (docu.ec)
- **Categoría:** extensión de Chrome que delega la descarga en un servicio web de Docu.
- **Uso y estado:** 325 usuarios, sin valoraciones, versión 1.0.3, actualizada el 27 jul 2026.
- **Precio:** instalar es gratis y la «descarga automática gratuita para comprobantes recientes» también; hay una «modalidad extendida de pago único para descargas masivas de periodos mayores» (importe: no consta). Según la web, el modo automático cubre el mes actual y el anterior, y el extendido un año completo.
- **Credenciales:** «No requiere que ingreses tu contraseña del SRI», pero necesita «la cookie de sesión activa del SRI», que se transmite «de forma segura a los servidores de Docu únicamente para ejecutar la descarga automática», con autorización explícita. Los comprobantes se guardan temporalmente hasta 48 h en sus servidores.
- **Formatos:** XML y PDF; el modo extendido da además «un reporte de comprobantes en formato Excel».
- **Filtros:** toma los parámetros de la consulta hecha en el portal. Reanudar, captcha y código abierto: no consta.
- **Fuentes:** https://chromewebstore.google.com/detail/doifmajcjkegfocdckoelpojekgjjlmg · https://downloader.docu.ec/ · https://chromeboard.com/extension/descargador-masivo-sri-doifmajcjkegfocdckoelpojekgjjlmg

### 3. Accountex365 | Gestor SRI (XML/PDF Downloader)
- **Categoría:** extensión de Chrome. Desarrollador: Accountex365 SAS.
- **Uso y estado:** 141 usuarios, 4,8 (5 reseñas), versión 1.5.7; fecha de actualización: no consta.
- **Precio:** según el agregador, se identifica como «free version» y no se detectaron funciones de pago.
- **Credenciales:** «debes ingresar al portal del SRI con tus propias credenciales»; la extensión usa la sesión del portal y no tiene login propio.
- **Formatos:** «busca y descarga los archivos XML y PDF disponibles en el portal»; también formularios CEP.
- **Permisos:** downloads, storage, tabs; hosts `*.sri.gob.ec`.
- **Filtros, reanudar, captcha, código abierto:** no consta.
- **Fuente:** https://extscope.org/extension/coggdlbgdgdjdeaelcfobaekdeadkifm

### 4. ContaBot Pro — Descarga XML SRI
- **Categoría:** extensión de Chrome («By NeuroTechEC»).
- **Uso y estado:** 37 usuarios, 5,0 (3 valoraciones), versión 2.3.2; fecha: no consta.
- **Precio:** el popup «requiere licencia activa»; importe: no consta.
- **Credenciales:** login manual en el portal; «No almacena ni transmite credenciales del SRI».
- **Formatos:** XML (facturas, retenciones, notas de crédito y débito, liquidaciones de compra, guías de remisión).
- **Filtros:** año, mes y tipo de documento; recorre día por día para cubrir el mes.
- **Reintentos:** reintento automático de descargas fallidas. Reanudar: no consta. Captcha y código abierto: no consta.
- **Fuente:** https://extscope.org/extension/jdceobljpdanafnbhekecmcpfgojopkd

### 5. SRI - DaatSRI Descarga Masiva de Comprobantes Electrónicos
- **Categoría:** extensión de Chrome (DaatSRI, Quito).
- **Uso y estado:** 647 usuarios, sin valoraciones, versión 1.0.5, actualizada el 23 abr 2026.
- **Precio y credenciales:** no consta.
- **Formatos:** «Descarga masivamente archivos xml y organiza comprobantes del SRI en subcarpetas (XML)».
- **Privacidad:** declara que trata información de identificación personal, financiera y de pago, ubicación, historial web y contenido de sitios.
- **Filtros, reanudar, captcha, código abierto:** no consta.
- **Fuente:** https://chromewebstore.google.com/detail/gokjdojamjphhhfjcbddamnnlbodipko

### 6. FREC SRI
- **Categoría:** extensión de Chrome conectada a la plataforma FREC (Facturas Rápidas EC).
- **Uso y estado:** 45 usuarios, 5,0 (1 valoración), versión 1.0.5, actualizada el 22 ene 2026.
- **Precio:** no consta.
- **Credenciales:** no consta en la ficha leída (un resumen de búsqueda decía «login manual, no captura credenciales», pero no pude confirmarlo en la ficha). Declara que trata «Authentication information» y «Website content».
- **Formatos y destino:** captura «todos los XMLs visibles en tu consulta» y los envía «automáticamente a tu plataforma de FREC».
- **Filtros, reanudar, captcha, código abierto:** no consta.
- **Fuente:** https://chromewebstore.google.com/detail/frec-sri/ppjlbimpmbjhiaemikjgnidgbnnokhbd

### 7. ExcelContable (Firefox)
- **Categoría:** complemento de Firefox, etiquetado «Experimental».
- **Uso y estado:** sin valoraciones, versión 1.5, actualizado el 7 jun 2026. Licencia: «All Rights Reserved».
- **Precio:** no consta.
- **Credenciales:** el usuario inicia sesión en el portal y hace la consulta; «La extensión no solicita ni almacena credenciales».
- **Formatos:** «Descarga XML y PDF del resultado consultado».
- **Filtros:** «Descarga XML recibidos de todo el mes por tipo de comprobante». Carpetas `XML-RUC / AÑO-MES / FAC|LIQ|NCR|NDE|RET`. Muestra un resumen final de descargados y errores.
- **Reanudar y captcha:** no consta.
- **Fuente:** https://addons.mozilla.org/en-US/firefox/addon/excelcontable/

### 8. Descargador de Comprobantes SRI (rolansor/sri-downloader-extension)
- **Categoría:** extensión para Chrome/Edge que se instala desde el código («Cargar descomprimida»); no la encontré publicada en tienda.
- **Estado:** creado en feb 2026, último push el 4 nov 2026 (activo). Licencia: **no declarada** (el repo no tiene archivo LICENSE).
- **Precio:** gratis (código público).
- **Credenciales:** «Inicia sesion en el portal SRI»; trabaja sobre la pestaña activa. Para el XML de emitidos consulta el web service público de autorización (`cel.sri.gob.ec`) con la clave de acceso.
- **Formatos:** XML y PDF (RIDE), recibidos y emitidos; exporta el historial a CSV.
- **Filtros:** tipo de comprobante; en emitidos, mes completo (itera día por día) o un día concreto.
- **Robustez:** «Reintentos automaticos: Reintenta descargas fallidas (configurable, default 2)», «Reintentar fallidos», «Guardado incremental… no se pierde si Chrome recicla el service worker», deduplicación, descarga persistente con el popup cerrado.
- **Captcha:** en emitidos indica que «no hay captcha». No afirma resolver captchas.
- **Fuente:** https://github.com/rolansor/sri-downloader-extension

### 9. SRI Pro Downloader (jonavez/sri-pro-downloader)
- **Categoría:** extensión de Chrome que se instala desde el código.
- **Estado:** versión 2.4.2 según el README, último push el 19 may 2026, 8 estrellas. Licencia: **no declarada**.
- **Credenciales:** el usuario hace la consulta en «Comprobantes Recibidos» con su sesión.
- **Formatos:** XML renombrado `RUC_FECHA_SECUENCIAL.xml`; «Genera reportes CSV».
- **Filtros:** los de la consulta del portal; puede «Descargar Todas las Páginas».
- **Reanudar, captcha:** no consta.
- **Fuente:** https://github.com/jonavez/sri-pro-downloader

### 10. Comprobantes SRI (CUENCOR S.A.S.)
- **Categoría:** app de escritorio para Windows 10/11 (Microsoft Store) y macOS.
- **Precio:** licencia por equipo, pago por transferencia, prueba de 7 días sin tarjeta; los importes no cargaron («Cargando planes…»).
- **Credenciales:** en modo automático la clave «se cifra en tu equipo»; en modo asistido inicias sesión tú y «Tu clave nunca se guarda». «Todo se procesa y guarda en tu computadora.»
- **Formatos:** XML recibidos y emitidos, RIDE PDF, Excel (libros de compras y ventas, resumen de IVA) y ATS en XML para el DIMM.
- **Filtros:** descarga masiva «por período y tipo».
- **Reanudar, captcha, código abierto:** no consta.
- **Fuente:** https://comprobantessri.com/

### 11. Descargas Documentos Digitales SRI (BORED155)
- **Categoría:** app de escritorio en Python + PySide6 (Linux y Windows) que controla Brave o Chrome por DevTools.
- **Estado:** creado el 5 nov 2026, último push el 12 nov 2026 (muy reciente). Licencia: **no declarada**.
- **Precio:** gratis (código público).
- **Credenciales:** **pide RUC/cédula y la clave del SRI**; «Con "Guardar la clave en este equipo" la clave queda cifrada en el llavero del sistema (keyring)»; si no, se borra al terminar.
- **Formatos:** XML de recibidos; en emitidos, XML del web service si es reciente y, si no, RIDE PDF; `indice AAAA-MM.xlsx`; PDF consolidado con marcadores.
- **Filtros:** mes y año, tipos de comprobante.
- **Robustez:** «Lo que ya existe no se vuelve a bajar».
- **Captcha:** «Si el SRI rechaza la verificación ("Captcha incorrecta"), la app reintenta y, si sigue, muestra la ventana de Brave para que pulses "Consultar"». Dice explícitamente que «no intenta engañar ni saltar el captcha». Documenta que la consulta de recibidos usa reCAPTCHA Enterprise invisible.
- **Fuente:** https://github.com/BORED155/DESCARGAS-DOCUMENTOS-DIGITALES-SRI

### 12. recibo.ec (CipherByte)
- **Categoría:** servicio web (portal, buzón @recibo.ec, visor ride.ec, conector MCP).
- **Precio:** «Gratis hasta 200 al mes»; los planes de pago muestran precio dentro de la cuenta. Ofrece traer gratis los comprobantes del mes anterior una vez por cédula/RUC.
- **Credenciales:** opcional: «conecta tu cédula o RUC con su clave del SRI» para recuperar comprobantes «directo del SRI». Dónde se guarda la clave: no consta (por el diseño, todo indica que se usa en su servidor, pero la página no lo dice).
- **Formatos:** XML autorizado, PDF, XLSX/CSV, JSON, ticket de 80 mm.
- **Filtros:** «con filtros por fecha, proveedor y monto».
- **Reanudar, captcha, código abierto:** no consta.
- **Fuente:** https://recibo.ec/

### 13. PlusFactura
- **Categoría:** plataforma web multiempresa para contadores; «Nuestro robot se conecta a la página del SRI».
- **Precio:** Emprendedor USD 9,50, Pro USD 14,50, Plus USD 17,50 y Elite USD 25,50 al mes (planes anuales con descuento); la prueba gratuita aparece como de 15 días y también de 7.
- **Credenciales:** no consta (el robot accede al SRI desde su lado).
- **Formatos:** «Reportes en Excel y PDF», «Archivos comprimidos con todos tus comprobantes electrónicos», ATS mensual y semestral.
- **Filtros, reanudar, captcha, código abierto:** no consta.
- **Fuente:** https://www.plusfactura.com.ec/

### 14. Tribufy (Tribu Sync)
- **Categoría:** SaaS contable con una extensión de Chrome (Tribu Sync).
- **Precio:** incluido en Tribu Pro, USD 14,99/mes con IVA: «Tribu Sync (extensión Chrome) · descarga automática de comprobantes recibidos».
- **Resto** (credenciales, formatos, filtros, captcha, código abierto): no consta.
- **Fuente:** https://tribufy.cloud/

### 15. Factunexo
- **Categoría:** SaaS de facturación electrónica.
- **Precio:** prueba de 14 días; importes: no consta.
- **Función relevante:** «Importación automática diaria desde el SRI».
- **Credenciales, formatos, filtros, captcha, código abierto:** no consta.
- **Fuente:** https://www.factunexo.com.ec/producto/comprobantes-electronicos-sri

## Conclusiones

### Diferencial honesto de Pluryfact
1. **Es el único con licencia libre real (AGPL-3.0).** Hay código público (rolansor, jonavez, BORED155), pero ninguno declara licencia, así que legalmente no son reutilizables. El resto es cerrado o no lo dice.
2. **Ni clave ni cookie salen de tu navegador.** Docu manda la cookie de sesión a sus servidores; recibo.ec y PlusFactura acceden al SRI desde su lado (recibo.ec pide la clave); FREC envía los XML a su plataforma; BORED155 y Comprobantes SRI (modo automático) piden la clave, aunque la guardan en local. Pluryfact no pide la clave, no tiene servidores ni analítica.
3. **Junta en un solo ZIP los recibidos y emitidos, con XML autorizado + RIDE + reporte TXT.** Ninguna ficha consultada describe esa combinación exacta. XML Manager da TXT, pero de reportes y separado; rolansor da XML+PDF sin TXT ni ZIP.
4. **El filtro por RUC o razón social del emisor en recibidos no aparece en ninguna ficha de extensión.** Solo recibo.ec, que es un servicio web con clave, filtra por proveedor.
5. **Reanuda cuando caduca la sesión del SRI**, algo que no consta en ninguna ficha. Lo más cercano son los reintentos de rolansor y ContaBot y el «no volver a bajar lo existente» de BORED155.
6. **Gratis sin límites declarados**, frente a Docu (paga para periodos largos), ContaBot (licencia), Comprobantes SRI y los SaaS (suscripción).

### Dónde la competencia es mejor (o Pluryfact no compite)
- **Excel/contabilidad:** Comprobantes SRI genera libros de compras y ventas, resumen de IVA y ATS; BORED155 genera un índice XLSX y un PDF consolidado; recibo.ec y PlusFactura exportan a Excel y ATS. Pluryfact entrega archivos, no reportes contables.
- **Sincronización desatendida:** Factunexo («importación automática diaria»), recibo.ec y PlusFactura traen comprobantes sin que el usuario abra el SRI, a cambio de entregar la clave o el acceso. Pluryfact necesita al usuario con la sesión abierta.
- **Tracción:** XML Manager tiene 3.000 usuarios y 264 valoraciones (4,9), una base de confianza que Pluryfact aún no tiene.
- **Navegadores:** rolansor soporta Edge y ExcelContable es para Firefox. Pluryfact es solo Chrome MV3, salvo que se confirme otra cosa.
- **Captcha:** nadie afirma resolverlo, así que no es una desventaja; conviene decir en la landing que Pluryfact tampoco lo resuelve y que el usuario hace la consulta.

## Productos descartados o no verificables

- **Contífico (Siigo):** no encontré documentación pública que confirme descarga o sincronización de comprobantes recibidos desde el SRI. Los resultados son artículos de blog sobre la descarga manual en el portal.
- **Alegra Ecuador:** sin documentación de importación de recibidos desde el SRI. El artículo encontrado sobre recepción automática es de Costa Rica (Hacienda), no aplica.
- **Dátil, Bsale, Perseo, Facturero:** las búsquedas no dieron ninguna fuente sobre descarga o sincronización de recibidos del SRI. No verificado.
- **Sovos:** su web habla de descargar comprobantes, sin detalle del mecanismo ni de los recibidos. No verificado.
- **iConta:** según un resumen de búsqueda, carga masiva de TXT/ZIP *ya descargados* del portal (no descarga del SRI). No entré a la fuente, así que queda sin verificar.
- **Ciro Contable, ContaEasy (facturandoec.com), Contamatic:** aparecieron en búsquedas que mencionan compras o recibidos, pero no se revisaron sus páginas. Sin verificar.
- **TributaFácil (extensión):** ficha en chromeboard: v1.1, 76 usuarios, actualizada el 8 jun 2025, «obtener XML y PDF de facturas, retenciones y otros». El resto no consta. Se descartó de la tabla por la poca información (https://chromeboard.com/extension/tributafacil-xml-bjmmgdoiohcaeokdfdmmpafpenhdpplp).
- **SRI_XML (Chrome):** solo genera CSV; no descarga XML ni PDF según su ficha (https://chromewebstore.google.com/detail/srixml/plmanhmncppkplijmigipbpmnflmiljn).
- **UpConta XML Downloader, Colmena Descarga XML, «sri downloader», «descarga xml sri», «Descargador De Comprobant», «SRI Descargador de Comprobantes», CIFA SRI:** salieron en búsquedas (chromeboard/extscope) pero no se abrieron sus fichas. Quedan como competencia probable, sin verificar.
- **«Leviatán»:** mencionado en un resumen de búsqueda (XML recibidos en ZIP, Chrome y Edge), pero no encontré ninguna fuente primaria. No verificado.
- **SRI Desktop Downloader (Ripio-SAS):** repo de GitHub solo con ejecutables de Windows («No source code»), última versión v1.1.19 del 24 sep 2026, genera un Excel. Sin descripción de credenciales ni formatos. No verificado (https://github.com/Ripio-SAS/sri-desktop-downloader-releases).
- **dmafla/sri_descarga_masiva:** app web FastAPI que descarga por claves de acceso desde un TXT/TSV del SRI (máximo 100 claves por corrida); no es descarga desde la sesión. Push único en mar 2026, sin licencia (https://github.com/dmafla/sri_descarga_masiva).
- **josepato87/sri_documents_downloader:** proyecto Playwright sin README, último push en feb 2025. Sin información.
- **Módulo Odoo cnd_l10n_ec_edi_import_cfdi:** importa XML/ZIP ya descargados; no descarga del SRI.
- **Tesis UEES 2025 (RPA con Selenium):** propuesta académica, no es un producto.
