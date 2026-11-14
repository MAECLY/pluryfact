# Ficha de Chrome Web Store

Texto para el panel de la tienda, en español (`es_419`, Español de
Latinoamérica), porque la interfaz de Pluryfact está en español y su público
son contribuyentes de Ecuador. Copia cada bloque en el campo que dice su
título. Las imágenes están en [images/](images/); [README.md](README.md) dice
qué archivo va en cada campo.

La tienda muestra la descripción como texto plano: respeta los saltos de línea
y no interpreta Markdown, así que los bloques no lo usan.

La tienda imprime el resumen justo encima de la descripción, así que la
descripción abre con su propia frase en vez de repetirlo, y nombra a SRI en
Línea en la primera oración para la búsqueda.

## Detalles del producto

### Título del paquete

Sale del manifest; no se edita aquí:

```text
Pluryfact
```

### Resumen del paquete

Sale del manifest (84 de 132 caracteres):

```text
Descarga en lote tus comprobantes electrónicos de SRI en Línea: XML, RIDE y reporte.
```

### Descripción

```text
Todos tus comprobantes del SRI, de una vez. Pluryfact baja en lote tus comprobantes electrónicos de SRI en Línea, recibidos y emitidos: el XML autorizado, el RIDE en PDF y el reporte TXT, ordenados por año y mes en un solo ZIP. Desde tu propia pestaña, con tu sesión, sin pedir tu clave.

CÓMO SE USA

1. Inicia sesión en SRI en Línea como siempre, con tu RUC o cédula y tu clave.
2. Desde el menú, entra a Facturación electrónica → Comprobantes electrónicos recibidos (o emitidos).
3. Abre Pluryfact, elige qué bajar y pulsa Descargar. Al terminar, el ZIP está en tu carpeta de descargas.

QUÉ HACE

• Recibidos y emitidos, en las dos pantallas de consulta del portal.
• El periodo que necesites: un día, un rango de fechas, un mes o un año completo.
• Facturas, retenciones, notas de crédito, notas de débito y liquidaciones de compra.
• Filtro por emisor en recibidos: quédate solo con un proveedor por su RUC o su razón social.
• XML autorizado, que es el documento con validez tributaria; RIDE, su representación impresa en PDF; y el reporte TXT del listado.
• Un solo ZIP ordenado: pluryfact/<tu RUC>/<recibidos o emitidos>/<año>/<mes>/.
• Pocas consultas, a propósito: recibidos se consulta un mes por vez, así que un año de facturas son 12 consultas, no 365.
• Cierra el popup y la descarga sigue. La insignia del ícono muestra el avance y recibes un aviso al terminar o si la sesión caduca.
• Si la sesión del SRI caduca (dura unos 20 minutos), Pluryfact guarda lo que ya bajó y te ofrece Reanudar: solo lo que faltó.
• Historial de descargas, como chrome://downloads, y ocho temas de color y tipografía, en claro y oscuro.

CÓMO CUIDA TU CUENTA

• Nunca pide tu clave del SRI. Usa la sesión que ya abriste en tu pestaña y nunca la guarda.
• Solo habla con el SRI: srienlinea.sri.gob.ec, con tu sesión, y cel.sri.gob.ec, el servicio web público de autorización de comprobantes.
• Sin servidores, sin cuentas, sin analítica. Tus comprobantes van del SRI a tu carpeta de descargas.
• Consulta a ritmo humano, una consulta a la vez. Si el SRI pide verificar el captcha, Pluryfact se pausa y sigue cuando lo resuelves tú; no resuelve ni evita captchas.

PERMISOS

• Leer y cambiar datos en srienlinea.sri.gob.ec (solo la pantalla de comprobantes): pulsar Consultar y bajar los archivos con tu sesión.
• Conectarse a cel.sri.gob.ec: pedir el XML autorizado de cada clave de acceso.
• Almacenamiento: guardar el avance, el historial y tus ajustes en este navegador.
• Scripts: activar Pluryfact en una pestaña del SRI que ya estaba abierta.
• Notificaciones: avisarte cuando termina una descarga o si tu sesión caduca.

LÍMITES

• No inicia sesión por ti: trabaja solo en una pestaña con la sesión iniciada.
• Un año completo puede pedir reanudar dos o tres veces, por la duración de la sesión del SRI.
• No exporta Excel, libros contables ni ATS: entrega los archivos tal como los da el SRI.

CÓDIGO ABIERTO

Gratis y de código abierto, con licencia AGPL-3.0.

Sitio web: https://pluryfact.maecly.com
Contacto: hola@maecly.com

Pluryfact no es una herramienta oficial del SRI ni está afiliado al Servicio de Rentas Internas. Los RIDE son representaciones impresas; el documento con validez tributaria es el XML autorizado.
```

### Categoría

**Herramientas** (`CATEGORY_EXTENSIONS_TOOLS`, en el grupo
«Productividad»). Pluryfact es una utilidad para bajar y ordenar archivos de un
portal; «Flujo de trabajo y planificación» es para gestionar tareas y
calendarios, y no encaja.

### Idioma

**Español (Latinoamérica) – es_419**

## Recursos gráficos

| Campo | Archivo |
|---|---|
| Ícono de la tienda | `images/icon-128.png` |
| Capturas de pantalla | `images/screenshot-1.png` … `screenshot-5.png`, en ese orden |
| Mosaico promocional pequeño | `images/promo-small.png` |
| Mosaico de marquesina | `images/promo-marquee.png` |
| Video promocional de YouTube | Ninguno |

## URL adicionales

| Campo | Valor |
|---|---|
| URL oficial | `https://pluryfact.maecly.com`, verificada en Search Console con la misma cuenta de la tienda (etiqueta `google-site-verification` en la landing; no quitarla) |
| URL de la página principal | `https://pluryfact.maecly.com` |
| URL de asistencia | `https://pluryfact.maecly.com/#preguntas` (preguntas frecuentes; el pie de esa página tiene `hola@maecly.com`) |
| Contenido para adultos | No |

## Distribución

- **Visibilidad:** Pública, o **No listada** para una primera ronda de prueba
  con usuarios reales antes de abrirla.
- **Regiones:** todas. El público es Ecuador, pero restringirla no aporta nada.
- **Precio:** gratis.
