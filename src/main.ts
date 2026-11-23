import './style.css';
import { App } from './ui/app';

declare global { interface Window { koOrbit?: App } }

function boot() {
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
