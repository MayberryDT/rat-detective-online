import * as THREE from 'three';
import { GameSession } from './session/GameSession';
import { loadTitleWorld } from './session/titleWorld';

function showWebGLError(error: unknown): void {
  const titleScreen = document.getElementById('title-screen');
  const message = error instanceof Error ? error.message : String(error);
  const escapedMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  if (!titleScreen) {
    document.body.textContent = 'WebGL is unavailable in this browser.';
    return;
  }

  titleScreen.classList.add('webgl-error');
  titleScreen.innerHTML = `
    <div class="webgl-error-panel">
      <h1>WebGL Unavailable</h1>
      <p>Rat Detective needs WebGL to render the 3D city. Your browser reported that WebGL is disabled or blocked.</p>
      <p>Turn on hardware acceleration/WebGL, try another browser, or check <code>chrome://gpu</code> for the exact graphics status.</p>
      <p><code>${escapedMessage}</code></p>
    </div>
  `;
}

function createRenderer(): THREE.WebGLRenderer | null {
  try {
    return new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    console.error('[Rat Detective] WebGL renderer failed to start', error);
    showWebGLError(error);
    return null;
  }
}


const startup = new AbortController();
window.addEventListener('pagehide', () => startup.abort(), { once: true });
void loadTitleWorld(startup.signal).then(world => {
  if (startup.signal.aborted) return;
  const renderer = createRenderer();
  if (renderer) new GameSession(renderer, world);
});

// A back/forward-cache restore needs a fresh socket and disposed renderer.
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
