import { instalarConductor } from '@/lib/conductor';

// Mundo MAIN: necesita jQuery/PrimeFaces de la página para esperar las consultas.
export default defineContentScript({
  matches: ['https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    instalarConductor(window);
  },
});
