import './style.css';
import { App } from './ui/app';
import { loadArt } from './render/art';

declare global { interface Window { koOrbit?: App } }

async function boot() {
  // character art is small; wait briefly so cards & portraits render with it (falls back to vector rigs)
  await Promise.race([loadArt(), new Promise((r) => setTimeout(r, 2500))]);
  if (location.hash === '#gallery') { import('./dev/gallery').then((m) => m.showGallery()); return; }
  try {
    window.koOrbit = new App();
  } catch (e) {
    const ui = document.getElementById('ui');
    if (ui) ui.innerHTML = `<div class="fatal">K.O Orbit failed to start: ${(e as Error).message}</div>`;
    throw e;
  }
}
boot();
