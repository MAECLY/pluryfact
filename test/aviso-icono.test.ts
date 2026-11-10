import { expect, it } from 'vitest';
import { insignia, notificacion } from '../src/lib/aviso-icono';
import type { EstadoTrabajo } from '../src/lib/mensajeria';

const base = { inicio: 1, consultasHechas: 3, consultasTotal: 12, descargados: 900, fallidos: 0, mensaje: '', pendientes: [] } as unknown as EstadoTrabajo;
const con = (c: Partial<EstadoTrabajo>) => ({ ...base, ...c }) as EstadoTrabajo;

it('insignia: progreso, atención y listo', () => {
  expect(insignia(con({ fase: 'descargando' }))).toMatchObject({ texto: '4/12' });
  expect(insignia(con({ fase: 'descargando' })).titulo).toMatch(/Puedes cerrar esta ventana/);
  expect(insignia(con({ fase: 'error' })).texto).toBe('!');
  expect(insignia(con({ fase: 'listo' })).texto).toBe('✓');
  expect(insignia(con({ fase: 'listo', pendientes: [4] })).texto).toBe('!');
  expect(insignia(undefined).texto).toBe('');
});

it('notifica solo al cambiar a listo o error, una vez', () => {
  const corriendo = con({ fase: 'descargando' });
  const listo = con({ fase: 'listo', zip: 'z.zip' });
  expect(notificacion(undefined, corriendo)).toBeNull();
  expect(notificacion(corriendo, listo)).toMatchObject({ titulo: 'Descarga lista', insistente: false });
  expect(notificacion(listo, listo)).toBeNull();
  const sesion = con({ fase: 'error', mensaje: 'Tu sesión del SRI caducó. Inicia…' });
  expect(notificacion(corriendo, sesion)).toMatchObject({ titulo: 'Tu sesión del SRI caducó', insistente: true });
});
