import { instalarConductor } from '@/lib/conductor';

// Mundo MAIN: necesita jQuery/PrimeFaces de la página para esperar las consultas.
export default defineContentScript({
  matches: ['https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    // El popup puede reinyectar este script: se instala una sola vez por página.
    const w = window as unknown as { __legajoConductor?: boolean };
    if (w.__legajoConductor) return;
    w.__legajoConductor = true;
    instalarConductor(window);
  },
});
