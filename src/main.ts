import { PlayerSettings } from './ui/PlayerSettings';
import { TitleScreen } from './ui/TitleScreen';
import { TitleMusic } from './ui/TitleMusic';
import { unlockEffectsAudio } from './audio/effectsAudio';

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

  const graphics = /webgl|web gl|graphics|context/i.test(message);
  titleScreen.classList.add('webgl-error');
  titleScreen.innerHTML = `
    <div class="webgl-error-panel">
      <h1>${graphics ? 'WebGL Unavailable' : 'City Could Not Load'}</h1>
      <p>${graphics ? 'Rat Detective needs WebGL to render the 3D city. Your browser reported that WebGL is disabled or blocked.' : 'The game could not finish loading. Check your connection and reload to try again.'}</p>
      ${graphics ? '<p>Turn on hardware acceleration/WebGL, try another browser, or check <code>chrome://gpu</code> for the exact graphics status.</p>' : ''}
      <p><code>${escapedMessage}</code></p>
    </div>
  `;
}


const startup = new AbortController();
const title = new TitleScreen();
title.settings = new PlayerSettings();
const music = new TitleMusic();
performance.mark('title-controls-ready');
let requested = false;
title.available = () => !requested;
title.onGesture = () => { void music.unlock(); unlockEffectsAudio(); };
title.onEnter = () => {
  requested = true;
  document.getElementById('enter-city-label')!.textContent = 'ENTERING…';
  performance.mark('city-entry-request');
};
window.addEventListener('pagehide', () => { startup.abort(); title.dispose(); music.dispose(); }, { once: true });
// Paint and enable the small title before downloading/evaluating the game.
requestAnimationFrame(() => setTimeout(() => {
  if (startup.signal.aborted) return;
  music.start();
  void import('./session/prepareGame').then(module => module.prepareGame(title,music,startup.signal)).then(session => {
    if (!session) return;
    if (startup.signal.aborted) { session.dispose(); return; }
    performance.mark('city-entry-ready');
    if (requested) session.enterCity();
  }).catch(error => {
    if (startup.signal.aborted) return;
    console.error('[Rat Detective] Game preparation failed',error);
    showWebGLError(error);
  });
}, 0));
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
