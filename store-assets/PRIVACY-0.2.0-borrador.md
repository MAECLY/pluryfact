# Pestaña de privacidad: borrador para la 0.2.0 (NO ENVIAR TODAVÍA)

> **Borrador.** La 0.1.0 sigue en revisión en Chrome Web Store con las
> respuestas de [PRIVACY.md](PRIVACY.md), que no se tocan. Este archivo prepara
> lo que cambia en la **0.2.0**, que trae la impresión con PluryPrint
> ([docs/INTEGRACION-PLURYPRINT.md](../docs/INTEGRACION-PLURYPRINT.md)). Se
> envía solo cuando la 0.1.0 esté aprobada y PluryPrint 0.0.6 publicado.

Manifest de la 0.2.0: lo mismo que la 0.1.0
(`permissions: ['storage', 'scripting', 'notifications']`, `host_permissions`
para `cel.sri.gob.ec/*` y
`srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*`, dos content
scripts en esa ruta) **más `optional_permissions: ['nativeMessaging']`**. El
permiso opcional no se concede al instalar ni al actualizar: Chrome lo pide
solo si el usuario pulsa «Conectar con PluryPrint» en Avanzado.

## Una sola finalidad

### Descripción de la finalidad única (reemplaza a la de la 0.1.0)

```text
Pluryfact descarga en lote los comprobantes electrónicos del propio usuario desde SRI en Línea, el portal del Servicio de Rentas Internas de Ecuador: el XML autorizado, el RIDE en PDF y el reporte TXT, ordenados por año y mes en un ZIP, y, si el usuario lo pide, los entrega a su aplicación de escritorio PluryPrint, en su mismo equipo, para imprimirlos. Trabaja dentro de la pestaña del portal que el usuario abrió, con la sesión que el usuario inició, y todo lo que hace sirve a esa única finalidad.
```

## Justificación de permisos

Las de `storage`, `scripting`, `notifications` y el permiso de host no cambian
(ver [PRIVACY.md](PRIVACY.md)). Se añade:

### Justificación de nativeMessaging

```text
Permiso opcional: no se concede al instalar ni al actualizar. Solo si el usuario pulsa «Conectar con PluryPrint» en la página de Pluryfact, Chrome le pide permiso para comunicarse con aplicaciones nativas que cooperan. Pluryfact lo usa con un único host, com.maecly.pluryprint, que instala la aplicación de escritorio PluryPrint (del mismo desarrollador) y que solo acepta conexiones de esta extensión. Por ese canal local Pluryfact entrega a PluryPrint los RIDE (PDF), los XML y el reporte TXT que el usuario eligió imprimir, para que PluryPrint los imprima en su equipo. No viaja nada por internet, no se manda ningún dato al desarrollador y el usuario puede quitar el permiso en cualquier momento con «Desconectar».
```

### ¿Utilizas código remoto?

Sigue siendo **No, no estoy usando código remoto**. El host nativo es una
aplicación aparte que el usuario instala por su cuenta; la extensión no
descarga ni ejecuta código.

## Uso de datos

Las casillas no cambian. La entrega a PluryPrint ocurre dentro del equipo del
usuario y a pedido suyo; no es una transferencia a terceros. Ajuste de redacción
en «Datos financieros y de pagos»:

| Casilla | Marcar | Por qué |
|---|---|---|
| Datos financieros y de pagos | **Sí** | Los comprobantes electrónicos son documentos tributarios del usuario: la extensión los baja del SRI a su carpeta de descargas y, si el usuario lo pide, los entrega a PluryPrint en su mismo equipo para imprimirlos. No los envía a nadie más. |

Las tres certificaciones siguen siendo ciertas.

## Política de privacidad

Antes de enviar, actualizar `site/privacy/` y `site/en/privacy/` del sitio
(repositorio privado) con un párrafo sobre PluryPrint: qué se entrega, que es
local, que el permiso es opcional y cómo quitarlo.

## Lista de comprobación antes de enviar la 0.2.0

- [ ] La 0.1.0 está aprobada (no subir nada mientras esté «pendiente»).
- [ ] PluryPrint 0.0.6 publicado con `pluryprint-bridge` y el registro del host.
- [ ] `wxt.config.ts`: `nativeMessaging` solo en `optional_permissions` (el build E2E no se sube).
- [ ] Copiar este borrador a [PRIVACY.md](PRIVACY.md) y borrar este archivo.
- [ ] Política de privacidad del sitio actualizada.
- [ ] Una captura de Avanzado → PluryPrint para la ficha, si se quiere mostrar.
