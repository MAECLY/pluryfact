# Pestaña de privacidad de Chrome Web Store

Respuestas para la pestaña **Privacidad** del panel de la tienda, en español.
Copia cada bloque en el campo que dice su título. Cada respuesta coincide con
el manifest de la 0.1.0: `permissions: ['storage', 'scripting', 'notifications']`,
`host_permissions` para `cel.sri.gob.ec/*` y
`srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*`, y dos content
scripts en esa misma ruta del portal (uno en el MAIN world). Si una versión
cambia algo de esto, actualiza este archivo antes de enviarla.

## Una sola finalidad

### Descripción de la finalidad única

```text
Pluryfact descarga en lote los comprobantes electrónicos del propio usuario desde SRI en Línea, el portal del Servicio de Rentas Internas de Ecuador: el XML autorizado, el RIDE en PDF y el reporte TXT, ordenados por año y mes en un ZIP. Trabaja dentro de la pestaña del portal que el usuario abrió, con la sesión que el usuario inició, y todo lo que hace sirve a esa única finalidad.
```

## Justificación de permisos

### Justificación de storage

```text
Guarda en el almacenamiento local de la extensión, en el equipo del usuario: el avance de la descarga en curso (para seguirla con el popup cerrado y poder reanudarla si la sesión del SRI caduca), el historial de descargas terminadas, los ajustes del usuario (ritmo de consulta, avisos, días de historial y tema) y un registro de diagnóstico con el RUC y las claves de acceso enmascarados. Nada de esto se envía fuera del navegador; el usuario puede borrarlo desde la página de la extensión (Avanzado → Borrar todos los datos).
```

### Justificación de scripting

```text
Si el usuario ya tenía abierta la pestaña de comprobantes de SRI en Línea antes de instalar o actualizar Pluryfact, los content scripts declarados no están en esa pestaña. scripting se usa solo para inyectar esos mismos archivos del paquete en esa pestaña del portal (srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*), para que el usuario no tenga que recargarla. No se inyecta código en ningún otro sitio ni código remoto.
```

### Justificación de notifications

```text
Muestra un aviso local de Chrome cuando termina una descarga, cuando la sesión del SRI caduca y hay que reanudar, o cuando ocurre un error, para que el usuario pueda cerrar el popup mientras se bajan sus comprobantes. Hay un solo aviso por trabajo, nunca uno por mes, y el usuario puede desactivarlos en Avanzado.
```

### Justificación de Permiso de host

```text
srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*: es la pantalla de Comprobantes electrónicos recibidos y emitidos de SRI en Línea. Los content scripts leen las tablas de resultados de esa pantalla, pulsan los mismos controles del portal (Consultar y el paginador) y bajan el RIDE y el reporte TXT con peticiones del mismo origen y la sesión del usuario. No corren en ninguna otra página del portal ni en otro sitio.

cel.sri.gob.ec: es el servicio web público de autorización de comprobantes del SRI. La extensión le envía cada clave de acceso para obtener el XML autorizado, que es el documento con validez tributaria. No se contacta ningún otro host.
```

### ¿Utilizas código remoto?

Elige **No, no estoy usando código remoto**. Todos los scripts van en el
paquete; no hay `eval()`, ni `<script>` externos, ni módulos remotos. El
content script del MAIN world es un archivo del paquete que llama a las
funciones que el propio portal ya tiene cargadas.

## Uso de datos

### ¿Qué datos de usuario piensas recoger?

La tienda pregunta por datos que la extensión **recoge o usa**. Pluryfact no
envía nada al desarrollador ni a terceros, pero sí trabaja con datos del
usuario dentro de su navegador. Respuesta recomendada:

| Casilla | Marcar | Por qué |
|---|---|---|
| Información de identificación personal | **Sí** | Lee y guarda localmente el RUC del usuario (nombra las carpetas y el ZIP, y aparece en el historial). No sale del equipo. |
| Información sanitaria | No | No la lee ni la guarda. |
| Datos financieros y de pagos | **Sí** | Los comprobantes electrónicos (facturas, retenciones) son documentos tributarios del usuario: la extensión los baja del SRI a su carpeta de descargas. No los envía a nadie más. |
| Información de autenticación | No | Nunca pide, lee ni guarda la clave del SRI. Las peticiones al portal usan la sesión que el navegador ya tiene, sin leer ni copiar sus cookies. |
| Comunicaciones personales | No | No las lee. |
| Ubicación | No | No la lee. |
| Historial web | No | No registra qué páginas se visitan. |
| Actividad del usuario | No | No registra clics, teclas ni movimiento. |
| Contenido del sitio web | **Sí** | Lee las tablas de resultados de la pantalla de comprobantes del SRI para saber qué descargar. |

Marcar estas casillas es lo honesto para lo que la extensión toca, y es
compatible con no transmitir nada: las certificaciones de abajo son
igualmente ciertas.

### Certifico que las siguientes afirmaciones son ciertas

Marca **las tres**; cada una es cierta:

- [x] No vendo ni transfiero datos de usuario a terceros, fuera de los casos prácticos aprobados
- [x] No uso ni transfiero datos de usuario para fines no relacionados con la finalidad única de mi elemento
- [x] No uso ni transfiero datos de usuarios para determinar su situación crediticia ni para ofrecer préstamos

## Política de privacidad

### URL de la Política de Privacidad

```text
https://pluryfact.maecly.com/privacy/
```

La misma política en inglés está en `https://pluryfact.maecly.com/en/privacy/`.
Su fuente es `site/privacy/index.html` y `site/en/privacy/index.html` en el
repositorio del sitio web, que es privado. El código de la extensión sí es
público, en este repositorio.
