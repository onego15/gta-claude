// Entry point: loading screen, title screen, pause/map menus and the frame loop.
import '@fontsource/anton/400.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import { Game } from './game/game.js';
import { loadCharacters } from './actors/charAssets.js';
import { loadWeapons } from './game/weapons.js';

const qp = new URLSearchParams(location.search);
const app = document.getElementById('app');

const CONTROLS = `
<div class="h">ON FOOT</div>
<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>move</span><span><kbd>Mouse</kbd>look</span><span><kbd>Shift</kbd>sprint</span><span><kbd>Space</kbd>jump</span>
<span><kbd>RMB</kbd>aim</span><span><kbd>LMB</kbd>shoot</span><span><kbd>R</kbd>reload</span><span><kbd>Q</kbd>switch weapon</span>
<span><kbd>C</kbd>crouch</span><span><kbd>F</kbd>enter / exit car</span><span><kbd>M</kbd>map</span><span><kbd>Esc</kbd>pause</span>
<div class="h">DRIVING</div>
<span><kbd>W</kbd>throttle</span><span><kbd>S</kbd>brake / reverse</span><span><kbd>A</kbd><kbd>D</kbd>steer</span><span><kbd>Space</kbd>handbrake</span>
<span><kbd>H</kbd>horn</span><span><kbd>G</kbd>siren (police car)</span>`;

const title = document.createElement('div'); title.className = 'screen title';
title.innerHTML = `<div class="logo">PORT AURORA</div><div class="tag">an open city story</div>
<div class="loadbar"><i></i></div><div class="loadtxt">Loading city…</div>
<button class="play hidden">Click to play</button>
<div class="controls">${CONTROLS}</div>
<div class="credit">Characters: MakeHuman / humanforge (CC0) · Animations: Quaternius Universal Animation Library (CC0) · Weapons & audio: Kenney (CC0) · Everything else procedurally generated</div>`;
app.appendChild(title);
const bar = title.querySelector('.loadbar i'), ltxt = title.querySelector('.loadtxt'), playBtn = title.querySelector('.play');

const pause = document.createElement('div'); pause.className = 'screen pause hidden';
pause.innerHTML = `<h1>PAUSED</h1><div class="btns"><button data-a="resume">Resume</button><button data-a="map">Map</button></div><div class="controls">${CONTROLS}</div><div class="stats"></div>`;
app.appendChild(pause);

const game = new Game(app, qp);
const setP = (f, t) => { bar.style.width = `${Math.round(f * 100)}%`; if (t) ltxt.textContent = t; };

async function boot() {
  setP(0.02, 'Loading people…');
  await loadCharacters((f) => setP(0.05 + f * 0.6));
  setP(0.68, 'Loading weapons…'); await loadWeapons();
  setP(0.72, 'Building the city…'); await new Promise((r) => setTimeout(r, 30));
  game.build();
  setP(0.95, 'Warming up…');
  game.render();
  setP(1, 'Ready');
  ltxt.classList.add('hidden'); title.querySelector('.loadbar').classList.add('hidden');
  playBtn.classList.remove('hidden');
  game.state = 'title';
  window.__ready = true;
  if (qp.has('autostart')) start();
}

function start() {
  title.classList.add('hidden');
  game.state = 'play';
  game.audio.start().catch(() => {});
  if (!qp.has('autostart')) game.renderer.domElement.requestPointerLock?.();
  game.hud.notify('Walk into the <span class="cy">yellow marker</span> to start a mission.', 7);
}
playBtn.addEventListener('click', start);
let paused = false, mapOpen = false;
function setPause(v) {
  paused = v; pause.classList.toggle('hidden', !v);
  if (v) { document.exitPointerLock?.(); pause.querySelector('.stats').textContent = `Missions passed: ${game.missions.passed.size}/3 · Cash: $${game.player.money}`; }
  else game.renderer.domElement.requestPointerLock?.();
}
pause.addEventListener('click', (e) => { const a = e.target.dataset.a; if (a === 'resume') setPause(false); if (a === 'map') { setPause(false); toggleMap(true); } });
function toggleMap(v) { mapOpen = v; game.hud.toggleMap(v); if (v) document.exitPointerLock?.(); else game.renderer.domElement.requestPointerLock?.(); }
addEventListener('keydown', (e) => {
  if (game.state === 'title' || game.state === 'loading') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (mapOpen) toggleMap(false); else setPause(!paused); }
  if (e.code === 'KeyM' && !paused) toggleMap(!mapOpen);
});
// losing pointer lock (Esc in browser) pauses the game
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && game.state === 'play' && !paused && !mapOpen && !qp.has('autostart')) setPause(true); });
game.renderer.domElement.addEventListener('click', () => { if (game.state === 'play' && !paused && !mapOpen && !document.pointerLockElement) game.renderer.domElement.requestPointerLock?.(); });

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!window.__manual) {
    if (!paused && !mapOpen) game.update(dt);
    if (game.state !== 'loading') game.render();
  }
  requestAnimationFrame(frame);
}
// deterministic stepping for automated capture: advance n frames of dt seconds each
window.__step = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) game.update(dt); game.render(); };
window.__start = start;
boot().then(() => requestAnimationFrame(frame)).catch((e) => { ltxt.textContent = `Error: ${e.message}`; console.error(e); });
