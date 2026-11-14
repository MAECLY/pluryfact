# Fixtures del protocolo PluryFact ↔ PluryPrint (v1)

Copia byte a byte de `pluryprint/src-tauri/tests/fixtures/bridge-protocol/*.json`,
que es la fuente canónica. Un archivo por intercambio:

- `<tipo>.request.json` y `<tipo>.response.json` para `hello`, `listPrinters`,
  `listProfiles`, `beginJob`, `putFile`, `commitJob` y `abortJob`.
- `error-<código>.response.json` para cada código de error del protocolo.

`test/pluryprint-contrato.test.ts` valida que el cliente de Pluryfact produce y
entiende exactamente estos mensajes y, si el repositorio hermano `../pluryprint`
está al lado, que los `.json` son idénticos byte a byte. Si cambias el protocolo,
cámbialo primero en PluryPrint y vuelve a copiar la carpeta.

Datos ficticios: RUC `0999999999001`, nunca claves reales.
