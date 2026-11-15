# Pestaña de privacidad: borrador para la 0.2.0 (NO ENVIAR TODAVÍA)

> **Borrador.** La 0.1.0 está aprobada y publicada en Chrome Web Store
> (2026-11-15) con las respuestas de [PRIVACY.md](PRIVACY.md). Este archivo prepara
> lo que cambia en la **0.2.0**, que trae la impresión con Pluryprint
> ([docs/INTEGRACION-PLURYPRINT.md](../docs/INTEGRACION-PLURYPRINT.md)). Se
> envía solo cuando la 0.1.0 esté aprobada y Pluryprint 0.0.6 publicado.

Manifest de la 0.2.0: lo mismo que la 0.1.0
(`permissions: ['storage', 'scripting', 'notifications']`, `host_permissions`
para `cel.sri.gob.ec/*` y
`srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*`, dos content
scripts en esa ruta) **más `optional_permissions: ['nativeMessaging']`**. El
permiso opcional no se concede al instalar ni al actualizar: Chrome lo pide
solo si el usuario pulsa «Conectar con Pluryprint» en Avanzado.

## Una sola finalidad

### Descripción de la finalidad única (reemplaza a la de la 0.1.0)

```text
Pluryfact descarga en lote los comprobantes electrónicos del propio usuario desde SRI en Línea, el portal del Servicio de Rentas Internas de Ecuador: el XML autorizado, el RIDE en PDF y el reporte TXT, ordenados por año y mes en un ZIP, y, si el usuario lo pide, los entrega a su aplicación de escritorio Pluryprint, en su mismo equipo, para imprimirlos. Trabaja dentro de la pestaña del portal que el usuario abrió, con la sesión que el usuario inició, y todo lo que hace sirve a esa única finalidad.
```

## Justificación de permisos

Las de `storage`, `scripting`, `notifications` y el permiso de host no cambian
(ver [PRIVACY.md](PRIVACY.md)). Se añade:

### Justificación de nativeMessaging

```text
Permiso opcional: no se concede al instalar ni al actualizar. Solo si el usuario pulsa «Conectar con Pluryprint» en la página de Pluryfact, Chrome le pide permiso para comunicarse con aplicaciones nativas que cooperan. Pluryfact lo usa con un único host, com.maecly.pluryprint, que instala la aplicación de escritorio Pluryprint (del mismo desarrollador) y que solo acepta conexiones de esta extensión. Por ese canal local Pluryfact entrega a Pluryprint los RIDE (PDF), los XML y el reporte TXT que el usuario eligió imprimir, para que Pluryprint los imprima en su equipo. No viaja nada por internet, no se manda ningún dato al desarrollador y el usuario puede quitar el permiso en cualquier momento con «Desconectar».
```

### ¿Utilizas código remoto?

Sigue siendo **No, no estoy usando código remoto**. El host nativo es una
aplicación aparte que el usuario instala por su cuenta; la extensión no
descarga ni ejecuta código.

## Uso de datos

Las casillas no cambian. La entrega a Pluryprint ocurre dentro del equipo del
usuario y a pedido suyo; no es una transferencia a terceros. Ajuste de redacción
en «Datos financieros y de pagos»:

| Casilla | Marcar | Por qué |
|---|---|---|
| Datos financieros y de pagos | **Sí** | Los comprobantes electrónicos son documentos tributarios del usuario: la extensión los baja del SRI a su carpeta de descargas y, si el usuario lo pide, los entrega a Pluryprint en su mismo equipo para imprimirlos. No los envía a nadie más. |

Las tres certificaciones siguen siendo ciertas.

## Política de privacidad

Antes de enviar, actualizar `site/privacy/` y `site/en/privacy/` del sitio
(repositorio privado) con un párrafo sobre Pluryprint: qué se entrega, que es
local, que el permiso es opcional y cómo quitarlo.

## Lista de comprobación antes de enviar la 0.2.0

- [x] La 0.1.0 está aprobada (2026-11-15).
- [x] Pluryprint 0.0.6 publicado con `pluryprint-bridge` y el registro del host (2026-11-14).
- [ ] `wxt.config.ts`: `nativeMessaging` solo en `optional_permissions` (el build E2E no se sube).
- [ ] Copiar este borrador a [PRIVACY.md](PRIVACY.md) y borrar este archivo.
- [ ] Actualizar [LISTING.md](LISTING.md), que hoy describe la 0.1.0:
  - «CÓMO CUIDA TU CUENTA»: «Solo habla con el SRI…» → «En internet, solo habla con el SRI… Fuera de internet, solo con Pluryprint, y solo si tú lo conectas.» (la misma idea que README y Acerca de).
  - «QUÉ HACE»: mencionar la impresión opcional con Pluryprint (RIDE en PDF, XML como representación impresa y reporte TXT).
  - «PERMISOS»: añadir el permiso opcional «Comunicarse con aplicaciones nativas que cooperan: solo con Pluryprint, en tu equipo, si lo conectas».
- [ ] Política de privacidad del sitio actualizada.
- [ ] Una captura de Avanzado → Pluryprint para la ficha, si se quiere mostrar.
