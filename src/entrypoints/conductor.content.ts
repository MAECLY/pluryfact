import { instalarConductor } from '@/lib/conductor';

// Mundo MAIN: necesita jQuery/PrimeFaces de la página para esperar las consultas.
export default defineContentScript({
  matches: ['https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    // Cada instalación tiene identidad propia; el content script le habla solo
    // al conductor más reciente. Reinyectar la misma versión no duplica nada.
    const w = window as unknown as { __legajoConductor?: string };
    const version = browser.runtime.getManifest().version;
    if (w.__legajoConductor?.startsWith(`${version}:`)) {
      window.postMessage({ canal: 'legajo-conductor', tipo: 'quien' }, location.origin);
      return;
    }
    const yo = `${version}:${crypto.randomUUID()}`;
    w.__legajoConductor = yo;
    instalarConductor(window, yo);
  },
});
