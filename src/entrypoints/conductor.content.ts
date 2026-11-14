import { instalarConductor } from '@/lib/conductor';

// Mundo MAIN: necesita jQuery/PrimeFaces de la página para esperar las consultas.
export default defineContentScript({
  matches: ['https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    // OJO: mundo MAIN = sin APIs de extensión (browser/chrome.runtime no existen).
    // Cada instalación tiene identidad propia y el content script le habla solo
    // al conductor más reciente, así que reinyectar no produce dobles clics.
    const yo = crypto.randomUUID();
    (window as unknown as { __pluryfactConductor?: string }).__pluryfactConductor = yo;
    instalarConductor(window, yo);
  },
});
