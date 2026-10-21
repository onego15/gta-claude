// DOM HUD: radar minimap with GPS route, wanted stars, health/armor, weapon & ammo,
// money, clock, objectives, subtitles, notifications, big mission/death titles,
// crosshair & hit markers, title / pause / map screens.
import * as THREE from 'three';
import { ROADS, ROAD_HALF, MIN, MAX, DOCK, LOT_INSET, PROMENADE } from '../world/layout.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; parent?.appendChild(e); return e; };
const fmtText = (s) => s.replace(/~y~/g, '<span class="cy">').replace(/~r~/g, '<span class="cr">').replace(/~b~/g, '<span class="cb">').replace(/~g~/g, '<span class="cg">').replace(/~w~/g, '</span>');
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 1.8l3.1 6.6 7.1.9-5.2 5 1.3 7.1L12 18l-6.3 3.4L7 14.3l-5.2-5 7.1-.9z"/></svg>';

export class HUD {
  constructor(game) {
    this.game = game;
    const root = this.root = el('div', 'hud', document.getElementById('app'));
    // top right cluster
    const tr = el('div', 'hud-tr', root);
    this.clock = el('div', 'hud-clock', tr, '18:00');
    this.weap = el('div', 'hud-weapon', tr);
    this.weapName = el('div', 'w-name', this.weap); this.ammo = el('div', 'w-ammo', this.weap);
    this.money = el('div', 'hud-money', tr, '$0');
    this.stars = el('div', 'hud-stars', tr);
    this.starEls = []; for (let i = 0; i < 5; i++) this.starEls.push(el('span', 'star', this.stars, STAR));
    // radar
    const rad = this.radarWrap = el('div', 'hud-radar', root);
    this.radar = el('canvas', '', rad); this.radar.width = this.radar.height = 220;
    const bars = el('div', 'hud-bars', rad);
    this.hpBar = el('div', 'bar hp', bars, '<i></i>'); this.arBar = el('div', 'bar ar', bars, '<i></i>');
    this.areaName = el('div', 'hud-area', root);
    // centre
    this.cross = el('div', 'hud-cross', root, '<i></i><i></i><i></i><i></i><b></b>');
    this.hitm = el('div', 'hud-hit', root, '<i></i><i></i><i></i><i></i>');
    this.helpEl = el('div', 'hud-help', root);
    this.obj = el('div', 'hud-objective', root);
    this.sub = el('div', 'hud-subtitle', root);
    this.notes = el('div', 'hud-notes', root);
    this.big = el('div', 'hud-big', root, '<div class="t"></div><div class="s"></div>');
    this.timerEl = el('div', 'hud-timer', root);
    this.damage = el('div', 'hud-damage', root);
    this.fade = el('div', 'hud-fade', root);
    this.speedo = el('div', 'hud-speedo', root);
    this.mapScreen = el('div', 'screen map-screen hidden', root, '<div class="map-title">PORT AURORA</div><canvas></canvas><div class="map-legend"><span class="lg y">● Objective</span><span class="lg m">● Mission</span><span class="lg s">⌂ Safehouse</span><span class="lg h">✚ Hospital</span><span class="lg p">★ Police</span></div><div class="map-hint">M / ESC to close</div>');
    this.mapCanvas = this.mapScreen.querySelector('canvas');
    this.kick = 0; this.hitT = 0; this.subT = 0; this.bigT = 0; this.helpT = 0; this.dmgT = 0;
    this._buildMap();
  }

  // ---------- pre-rendered city map ----------------------------------------------------
  _buildMap() {
    const g = this.game, S = 2; // px per metre
    const x0 = DOCK.x0 - 20, x1 = MAX + LOT_INSET + PROMENADE + 30, z0 = MIN - LOT_INSET - PROMENADE - 30, z1 = MAX + LOT_INSET + PROMENADE + 30;
    this.map = { x0, z0, S, w: (x1 - x0) * S, h: (z1 - z0) * S };
    const c = document.createElement('canvas'); c.width = this.map.w; c.height = this.map.h; const x = c.getContext('2d');
    const P = (wx, wz) => [(wx - x0) * S, (wz - z0) * S];
    const rect = (a, b, cx, cz, col) => { const [px, pz] = P(a, b); x.fillStyle = col; x.fillRect(px, pz, (cx - a) * S, (cz - b) * S); };
    x.fillStyle = '#1d4a5c'; x.fillRect(0, 0, c.width, c.height);
    const L0 = MIN - LOT_INSET - PROMENADE, L1 = MAX + LOT_INSET + PROMENADE;
    rect(L0, L0, L1, L1, '#4a5056');
    rect(DOCK.x0, DOCK.z0, L0, DOCK.z1, '#4c5054');
    for (const p of g.city.parks) rect(p.x0, p.z0, p.x1, p.z1, '#3f6b3d');
    for (const p of g.city.plazas) rect(p.x0, p.z0, p.x1, p.z1, '#6a6660');
    for (const b of g.city.colliders) if (b.kind === 'building') rect(b.x0, b.z0, b.x1, b.z1, '#8b8d90');
    for (const b of g.city.colliders) if (b.kind === 'container') rect(b.x0, b.z0, b.x1, b.z1, '#7a5a4a');
    // roads
    for (const r of ROADS) { rect(r - ROAD_HALF, MIN - ROAD_HALF, r + ROAD_HALF, MAX + ROAD_HALF, '#2b2e31'); rect(MIN - ROAD_HALF, r - ROAD_HALF, MAX + ROAD_HALF, r + ROAD_HALF, '#2b2e31'); }
    rect(L0 - 1, 34, MIN - ROAD_HALF, 46, '#2b2e31');
    x.strokeStyle = 'rgba(255,210,80,0.35)'; x.lineWidth = 1; x.setLineDash([6, 6]);
    for (const r of ROADS) { x.beginPath(); x.moveTo(...P(r, MIN)); x.lineTo(...P(r, MAX)); x.stroke(); x.beginPath(); x.moveTo(...P(MIN, r)); x.lineTo(...P(MAX, r)); x.stroke(); }
    this.mapImg = c;
  }
  w2m(wx, wz) { return [(wx - this.map.x0) * this.map.S, (wz - this.map.z0) * this.map.S]; }

  // ---------- messages -------------------------------------------------------------------
  notify(text, time = 4) {
    const n = el('div', 'note', this.notes, fmtText(text));
    setTimeout(() => n.classList.add('out'), time * 1000); setTimeout(() => n.remove(), time * 1000 + 600);
    while (this.notes.children.length > 3) this.notes.firstChild.remove();
  }
  objective(text) { this.obj.innerHTML = text ? fmtText(text) : ''; this.obj.classList.toggle('show', !!text); }
  subtitle(text, time = 4) { this.sub.innerHTML = fmtText(text); this.sub.classList.add('show'); this.subT = time; }
  help(text) { this.helpEl.innerHTML = fmtText(text); this.helpEl.classList.add('show'); this.helpT = 0.15; }
  bigMessage(title, sub = '', color = '#ffd23a', time = 3) {
    this.big.querySelector('.t').textContent = title; this.big.querySelector('.s').textContent = sub;
    this.big.style.setProperty('--c', color); this.big.classList.remove('show'); void this.big.offsetWidth; this.big.classList.add('show'); this.bigT = time;
  }
  hitMarker(kill) { this.hitT = 0.18; this.hitm.classList.toggle('kill', !!kill); this.game.audio.play('hit', { volume: kill ? 0.6 : 0.35, rate: kill ? 0.7 : 1 }); }
  crosshairKick() { this.kick = Math.min(1, this.kick + 0.5); }
  starsPulse() { this.stars.classList.remove('pulse'); void this.stars.offsetWidth; this.stars.classList.add('pulse'); }
  damageFlash(a) { this.dmgT = Math.min(1, this.dmgT + a); }
  setFade(a) { this.fade.style.opacity = a; }
  toggleMap(show) { this.mapScreen.classList.toggle('hidden', !show); if (show) this.drawBigMap(); }

  // ---------- per-frame ------------------------------------------------------------------
  update(dt) {
    const g = this.game, p = g.player;
    // clock
    const tod = g.env.time; const hh = Math.floor(tod) % 24, mm = Math.floor((tod % 1) * 60);
    this.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.money.textContent = `$${Math.floor(this._money = this._money === undefined ? p.money : this._money + (p.money - this._money) * Math.min(1, dt * 6)).toLocaleString('en-US')}`;
    // weapon
    const w = p.weapon;
    if (w) { this.weap.style.display = ''; this.weapName.textContent = w.def.name; this.ammo.innerHTML = w.reloading > 0 ? '<span class="rl">RELOADING</span>' : `<b>${w.ammo}</b><span>/${w.reserve}</span>`; }
    else this.weap.style.display = 'none';
    // stars
    const lvl = g.wanted.level; const flashOff = g.wanted.flash && Math.floor(g.time * 3) % 2 === 0;
    this.starEls.forEach((s, i) => { s.classList.toggle('on', i < lvl && !flashOff); s.classList.toggle('dim', i < lvl && flashOff); });
    this.stars.classList.toggle('active', lvl > 0);
    // bars
    this.hpBar.firstChild.style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`; this.hpBar.classList.toggle('low', p.hp < 30);
    this.arBar.firstChild.style.width = `${Math.max(0, p.armor)}%`; this.arBar.style.opacity = p.armor > 0 ? 1 : 0.35;
    // crosshair
    const showCross = p.aiming && !p.vehicle && !p.dead;
    this.cross.classList.toggle('show', showCross);
    const spread = 6 + this.kick * 10 + Math.min(8, Math.hypot(p.vel.x, p.vel.z) * 2);
    this.cross.style.setProperty('--s', `${spread}px`);
    this.kick = Math.max(0, this.kick - dt * 4);
    // aim on a target turns the crosshair red
    if (showCross) { const tgt = g.aimTarget; this.cross.classList.toggle('enemy', !!tgt && (tgt.team !== 'civ' || g.wanted.level > 0)); this.cross.classList.toggle('civ', !!tgt && tgt.team === 'civ'); }
    this.hitT -= dt; this.hitm.classList.toggle('show', this.hitT > 0);
    // timers
    if ((this.subT -= dt) <= 0) this.sub.classList.remove('show');
    if ((this.bigT -= dt) <= 0) this.big.classList.remove('show');
    if ((this.helpT -= dt) <= 0) this.helpEl.classList.remove('show');
    this.dmgT = Math.max(0, this.dmgT - dt * 1.5); this.damage.style.opacity = this.dmgT;
    const mt = g.missions.timer;
    if (mt !== null && mt !== undefined && g.missions.active) { this.timerEl.style.display = ''; this.timerEl.textContent = `${Math.floor(mt / 60)}:${String(Math.floor(mt % 60)).padStart(2, '0')}`; this.timerEl.classList.toggle('low', mt < 20); }
    else this.timerEl.style.display = 'none';
    // speedometer
    if (p.vehicle && p.seatState === 'seated') { this.speedo.style.display = ''; this.speedo.innerHTML = `<b>${Math.round(Math.abs(p.vehicle.speed) * 3.6)}</b><span>KM/H</span>`; } else this.speedo.style.display = 'none';
    this.areaName.textContent = g.areaName || '';
    this.drawRadar();
  }

  drawRadar() {
    const g = this.game, p = g.player, c = this.radar, x = c.getContext('2d'), R = c.width / 2;
    const pos = p.wpos;
    const inCar = !!p.vehicle;
    const zoom = inCar ? THREE.MathUtils.clamp(1.0 - Math.abs(p.vehicle.speed) * 0.012, 0.6, 1.0) : 1.25; // px per metre on the radar
    const scale = zoom / this.map.S;
    const rot = Math.PI + g.camera.yaw; // camera forward is up
    x.save(); x.clearRect(0, 0, c.width, c.height);
    x.beginPath(); x.arc(R, R, R - 2, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#1d4a5c'; x.fillRect(0, 0, c.width, c.height);
    x.translate(R, R); x.rotate(rot); x.scale(scale, scale);
    const [mx, mz] = this.w2m(pos.x, pos.z);
    x.globalAlpha = 0.92; x.drawImage(this.mapImg, -mx, -mz); x.globalAlpha = 1;
    // GPS route
    const route = g.gpsRoute;
    if (route && route.length > 1) {
      x.strokeStyle = g.missions.active ? '#ffd23a' : '#c879ff'; x.lineWidth = 7 / scale * 0.6; x.lineJoin = 'round'; x.lineCap = 'round'; x.globalAlpha = 0.85;
      x.beginPath(); route.forEach((q, i) => { const [qx, qz] = this.w2m(q.x, q.z); if (i) x.lineTo(qx - mx, qz - mz); else x.moveTo(qx - mx, qz - mz); }); x.stroke(); x.globalAlpha = 1;
    }
    // police search area
    if (g.wanted.level > 0 && g.wanted.flash) {
      const [lx, lz] = this.w2m(g.wanted.lastKnown.x, g.wanted.lastKnown.z);
      x.fillStyle = Math.floor(g.time * 2) % 2 ? 'rgba(255,60,60,0.18)' : 'rgba(60,110,255,0.18)'; x.beginPath(); x.arc(lx - mx, lz - mz, (30 + g.wanted.level * 12) * this.map.S, 0, 6.29); x.fill();
    }
    x.restore();
    // blips (screen space, clamped to the rim)
    const blip = (wx, wz, draw, clamp = true) => {
      let dx = (wx - pos.x) * zoom, dz = (wz - pos.z) * zoom;
      const cs = Math.cos(rot), sn = Math.sin(rot); let sx = dx * cs - dz * sn, sy = dx * sn + dz * cs;
      const d = Math.hypot(sx, sy); const lim = R - 12;
      let edge = false;
      if (d > lim) { if (!clamp) return; sx *= lim / d; sy *= lim / d; edge = true; }
      draw(R + sx, R + sy, edge);
    };
    const dot = (col, r = 4, ring = '#000') => (px, py, edge) => { x.fillStyle = col; x.strokeStyle = ring; x.lineWidth = 1.5; x.beginPath(); x.arc(px, py, edge ? r * 0.85 : r, 0, 6.29); x.fill(); x.stroke(); };
    const letter = (ch, col) => (px, py) => { x.fillStyle = col; x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.arc(px, py, 8, 0, 6.29); x.fill(); x.stroke(); x.fillStyle = '#111'; x.font = 'bold 11px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, px, py + 0.5); };
    const s = g.city.sites;
    blip(s.safehouse.x, s.safehouse.z, letter('⌂', '#7ad0ff'), false);
    blip(s.hospital.x, s.hospital.z, letter('+', '#ff8a8a'), false);
    blip(s.police.x, s.police.z, letter('★', '#8ab0ff'), false);
    for (const st of g.missions.starts) if (st.marker) blip(st.def.start.x, st.def.start.z, letter(st.def.giver[0], '#ffd23a'));
    for (const h of g.humans) {
      if (h.dead || h === p) continue;
      if (h.team === 'cop' && g.wanted.level > 0) blip(h.wpos?.x ?? h.pos.x, h.wpos?.z ?? h.pos.z, dot(Math.floor(g.time * 4) % 2 ? '#ff3b3b' : '#3b6bff', 3.5), false);
      else if (h.team === 'gang' && g.missions.active) blip(h.pos.x, h.pos.z, dot('#ff3b3b', 3.5));
    }
    for (const v of g.wanted.units) if (!v.dead && v.driver) blip(v.pos.x, v.pos.z, dot(Math.floor(g.time * 4) % 2 ? '#ff3b3b' : '#3b6bff', 5));
    const tgt = g.missions.target; if (tgt) blip(tgt.x, tgt.z, dot('#ffd23a', 6));
    // player arrow
    x.save(); x.translate(R, R); x.rotate(rot - (p.vehicle ? p.vehicle.heading : p.heading) + Math.PI);
    x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, -9); x.lineTo(6.5, 7); x.lineTo(0, 3.5); x.lineTo(-6.5, 7); x.closePath(); x.fill(); x.stroke(); x.restore();
    // north marker
    blip(pos.x, pos.z - 1000, (px, py) => { x.fillStyle = '#fff'; x.font = 'bold 12px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('N', px, py); });
  }

  drawBigMap() {
    const g = this.game, c = this.mapCanvas; const W = Math.min(innerWidth * 0.86, 1100), H = W * this.map.h / this.map.w;
    c.width = W; c.height = H; const x = c.getContext('2d'); const k = W / this.map.w;
    x.drawImage(this.mapImg, 0, 0, W, H);
    const P = (wx, wz) => { const [a, b] = this.w2m(wx, wz); return [a * k, b * k]; };
    const route = g.gpsRoute;
    if (route) { x.strokeStyle = '#ffd23a'; x.lineWidth = 3; x.beginPath(); route.forEach((q, i) => { const [a, b] = P(q.x, q.z); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.stroke(); }
    const mark = (wx, wz, col, label) => { const [a, b] = P(wx, wz); x.fillStyle = col; x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.arc(a, b, 7, 0, 6.29); x.fill(); x.stroke(); if (label) { x.fillStyle = '#fff'; x.font = '600 14px "Barlow Condensed"'; x.fillText(label, a + 10, b + 5); } };
    const s = g.city.sites;
    mark(s.safehouse.x, s.safehouse.z, '#7ad0ff', 'Safehouse'); mark(s.hospital.x, s.hospital.z, '#ff8a8a', 'Hospital'); mark(s.police.x, s.police.z, '#8ab0ff', 'Police'); mark(s.docks.x, s.docks.z, '#b0a090', 'Docks');
    for (const st of g.missions.starts) if (st.marker) mark(st.def.start.x, st.def.start.z, '#ffd23a', st.def.title);
    const tgt = g.missions.target; if (tgt) mark(tgt.x, tgt.z, '#ffd23a', 'Objective');
    const pp = g.player.wpos; const [a, b] = P(pp.x, pp.z); x.fillStyle = '#fff'; x.beginPath(); x.arc(a, b, 6, 0, 6.29); x.fill(); x.strokeStyle = '#000'; x.stroke();
  }
}
