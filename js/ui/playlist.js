// Playlist: arrange pattern clips on tracks over time (song mode).
import { h, fitCanvas, css } from './widgets.js';
import { uid } from '../state.js';

const HEADW = 96, HEAD = 24;

export class Playlist {
  constructor(app, host, tools) {
    this.app = app; this.host = host; this.tools = tools;
    this.canvas = h('canvas', { style: { touchAction: 'none', display: 'block' } });
    host.append(this.canvas);
    this.barW = 64; this.trackH = 44; this.sx = 0; this.sy = 0;
    this.tool = 'draw'; this.snap = 1;
    this.drag = null;
    this.renderTools();
    this.bind();
  }

  renderTools() {
    const tool = (id, label, tip) => h('button', { class: 'chip' + (this.tool === id ? ' on' : ''), title: tip, onclick: () => { this.tool = id; this.renderTools(); } }, label);
    this.tools.replaceChildren(
      tool('draw', '✎ Paint', 'Click to place the selected pattern; drag to move; drag the right edge to resize; right-click to delete'),
      tool('erase', '⌫ Erase', 'Erase clips'),
      tool('pan', '✋ Pan', 'Pan the view'),
      h('select', { class: 'chip', title: 'Snap', onchange: e => this.snap = +e.target.value },
        h('option', { value: 1 }, 'Snap: Bar'), h('option', { value: 0.25 }, 'Snap: Beat')),
      h('button', { class: 'chip', title: 'Zoom out', onclick: () => { this.barW = Math.max(16, this.barW / 1.25); this.draw(); } }, '−'),
      h('button', { class: 'chip', title: 'Zoom in', onclick: () => { this.barW = Math.min(240, this.barW * 1.25); this.draw(); } }, '＋'),
      h('button', { class: 'chip', title: 'Switch to Song mode and play the arrangement from the start', onclick: () => { this.app.setMode('song'); this.app.engine.play(0); } }, '▶ Play song'),
    );
  }

  x(bar) { return HEADW + bar * this.barW - this.sx; }
  y(track) { return HEAD + track * this.trackH - this.sy; }
  barAt(x) { return (x - HEADW + this.sx) / this.barW; }
  trackAt(y) { return Math.floor((y - HEAD + this.sy) / this.trackH); }
  clipAt(x, y) {
    const t = this.trackAt(y), b = this.barAt(x);
    const clips = this.app.project.playlist.clips;
    for (let i = clips.length - 1; i >= 0; i--) {
      const c = clips[i];
      if (c.track === t && b >= c.start && b < c.start + c.len) return { c, edge: x > this.x(c.start + c.len) - 8 };
    }
    return null;
  }

  draw() {
    const { w, h: H, dpr } = fitCanvas(this.canvas, this.host);
    this.W = w; this.H = H;
    const g = this.canvas.getContext('2d'), pr = this.app.project, pl = pr.playlist;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = css('--panel'); g.fillRect(0, 0, w, H);
    const muted = pl.muted || [];
    // rows
    g.save(); g.beginPath(); g.rect(HEADW, HEAD, w, H); g.clip();
    for (let t = 0; t < pl.tracks; t++) {
      g.fillStyle = t % 2 ? 'rgba(255,255,255,.015)' : 'rgba(0,0,0,.08)';
      g.fillRect(HEADW, this.y(t), w, this.trackH);
    }
    const b0 = Math.max(0, Math.floor(this.barAt(HEADW))), b1 = Math.ceil(this.barAt(w));
    for (let b = b0; b <= b1; b++) {
      g.fillStyle = b % 4 === 0 ? css('--grid-strong') : css('--grid');
      g.fillRect(Math.round(this.x(b)), HEAD, 1, H);
      if (this.barW > 40) { g.fillStyle = css('--grid'); for (let q = 1; q < 4; q++) g.fillRect(Math.round(this.x(b + q / 4)), HEAD, 1, H); }
    }
    // clips
    pl.clips.forEach(c => {
      const pat = pr.patterns.find(p => p.id === c.pattern); if (!pat) return;
      const x = this.x(c.start), y = this.y(c.track) + 2, cw = c.len * this.barW - 2, ch = this.trackH - 4;
      const idx = pr.patterns.indexOf(pat);
      const col = ['#ff5c8a', '#ffb547', '#5cf2a0', '#4cc9ff', '#a78bfa', '#ff7b54', '#f5e663', '#62e0d9'][idx % 8];
      g.globalAlpha = muted[c.track] ? 0.3 : 1;
      g.fillStyle = col + '33'; g.strokeStyle = col; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect ? g.roundRect(x, y, cw, ch, 5) : g.rect(x, y, cw, ch); g.fill(); g.stroke();
      g.fillStyle = col; g.fillRect(x, y, cw, 14);
      g.fillStyle = '#0d0f17'; g.font = 'bold 10px system-ui';
      g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
      g.fillText(pat.name, x + 4, y + 11);
      // note preview, repeated for each pattern loop inside the clip
      const pBars = pat.steps / 16;
      let lo = 127, hi = 0;
      Object.values(pat.notes).forEach(ns => ns.forEach(n => { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }));
      const range = Math.max(1, hi - lo);
      g.fillStyle = col;
      for (let rep = 0; rep < c.len / pBars; rep++) {
        Object.entries(pat.notes).forEach(([cid, ns]) => ns.forEach(n => {
          const nx = x + (rep * pBars + n.s / 16) * this.barW, ny = y + 16 + (1 - (n.p - lo) / range) * (ch - 20);
          g.fillRect(nx, ny, Math.max(1.5, n.l / 16 * this.barW - 1), 2);
        }));
        if (rep > 0) { g.fillStyle = col + '66'; g.fillRect(x + rep * pBars * this.barW, y + 14, 1, ch - 14); g.fillStyle = col; }
      }
      g.restore();
      g.globalAlpha = 1;
    });
    // playhead
    if (this.play != null && pr.mode === 'song') { g.fillStyle = css('--ok'); g.fillRect(this.x(this.play / 16), HEAD, 2, H); }
    g.restore();
    // track headers
    g.save(); g.beginPath(); g.rect(0, HEAD, HEADW, H); g.clip();
    for (let t = 0; t < pl.tracks; t++) {
      const y = this.y(t);
      g.fillStyle = css('--panel2'); g.fillRect(0, y, HEADW - 1, this.trackH - 1);
      g.fillStyle = muted[t] ? css('--step-off-alt') : css('--ok');
      g.beginPath(); g.arc(14, y + this.trackH / 2, 5, 0, 7); g.fill();
      g.fillStyle = css('--text'); g.font = '12px system-ui'; g.fillText(`Track ${t + 1}`, 26, y + this.trackH / 2 + 4);
    }
    g.restore();
    // ruler
    g.fillStyle = css('--panel2'); g.fillRect(0, 0, w, HEAD);
    g.fillStyle = css('--muted'); g.font = '11px system-ui';
    for (let b = b0; b <= b1; b++) {
      const x = this.x(b); if (x < HEADW) continue;
      g.fillRect(x, 12, 1, 12);
      if (this.barW > 28 || b % 4 === 0) g.fillText(String(b + 1), x + 3, 15);
    }
    g.fillText(pr.mode === 'song' ? 'SONG' : 'pattern mode', 8, 15);
  }

  setPlayhead(step) { if (step !== this.play) { this.play = step; this.draw(); } }

  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { const b = this.barAt(e.offsetX); this.barW = Math.max(16, Math.min(240, this.barW * (e.deltaY > 0 ? 0.9 : 1.1))); this.sx = Math.max(0, b * this.barW - (e.offsetX - HEADW)); }
      else if (e.shiftKey) this.sx = Math.max(0, this.sx + (e.deltaY || e.deltaX));
      else { this.sx = Math.max(0, this.sx + e.deltaX); this.sy = Math.max(0, Math.min(this.app.project.playlist.tracks * this.trackH - (this.H - HEAD) + 20, this.sy + e.deltaY)); }
      this.draw();
    }, { passive: false });
    c.addEventListener('pointerdown', e => this.down(e));
    c.addEventListener('pointermove', e => this.move(e));
    c.addEventListener('pointerup', () => this.up());
    c.addEventListener('pointercancel', () => this.up());
    c.addEventListener('dblclick', e => {
      const hit = this.clipAt(e.offsetX, e.offsetY);
      if (hit) { this.app.selectPattern(this.app.project.patterns.findIndex(p => p.id === hit.c.pattern)); this.app.wm.show('rack'); }
    });
  }

  down(e) {
    const app = this.app, pr = app.project, pl = pr.playlist, x = e.offsetX, y = e.offsetY;
    this.canvas.setPointerCapture(e.pointerId);
    if (this.tool === 'pan' || e.button === 1) { this.drag = { type: 'pan', x, y, sx: this.sx, sy: this.sy }; return; }
    if (y < HEAD) { // ruler: play song from here
      const bar = Math.max(0, Math.floor(this.barAt(x)));
      app.setMode('song'); app.engine.play(bar * 16); return;
    }
    if (x < HEADW) {
      const t = this.trackAt(y); if (t < 0 || t >= pl.tracks) return;
      app.commit(() => { pl.muted = pl.muted || []; pl.muted[t] = !pl.muted[t]; }); return;
    }
    const t = this.trackAt(y); if (t < 0 || t >= pl.tracks) return;
    const hit = this.clipAt(x, y);
    if (e.button === 2 || this.tool === 'erase') { app.checkpoint(); this.drag = { type: 'erase' }; this.eraseAt(x, y); return; }
    app.checkpoint();
    if (hit) {
      app.selectPattern(pr.patterns.findIndex(p => p.id === hit.c.pattern), false);
      this.drag = hit.edge ? { type: 'resize', c: hit.c, len: hit.c.len, b: this.barAt(x) } : { type: 'move', c: hit.c, start: hit.c.start, track: hit.c.track, b: this.barAt(x), t };
      return;
    }
    const pat = app.pattern;
    const start = Math.max(0, Math.floor(this.barAt(x) / this.snap) * this.snap);
    const clip = { id: uid(), pattern: pat.id, track: t, start, len: Math.max(this.snap, pat.steps / 16) };
    pl.clips.push(clip);
    this.drag = { type: 'move', c: clip, start, track: t, b: this.barAt(x), t };
    this.draw();
  }

  move(e) {
    const d = this.drag, x = e.offsetX, y = e.offsetY;
    if (!d) {
      const hit = this.clipAt(x, y);
      this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : y < HEAD ? 'pointer' : hit ? (hit.edge ? 'ew-resize' : 'move') : 'crosshair';
      return;
    }
    const pl = this.app.project.playlist;
    if (d.type === 'pan') { this.sx = Math.max(0, d.sx - (x - d.x)); this.sy = Math.max(0, d.sy - (y - d.y)); }
    else if (d.type === 'erase') this.eraseAt(x, y);
    else if (d.type === 'move') {
      d.c.start = Math.max(0, d.start + Math.round((this.barAt(x) - d.b) / this.snap) * this.snap);
      d.c.track = Math.max(0, Math.min(pl.tracks - 1, d.track + this.trackAt(y) - d.t));
    } else if (d.type === 'resize') {
      d.c.len = Math.max(this.snap, d.len + Math.round((this.barAt(x) - d.b) / this.snap) * this.snap);
    }
    this.draw();
  }

  up() {
    if (!this.drag) return;
    const t = this.drag.type; this.drag = null;
    if (t !== 'pan') this.app.changed();
  }

  eraseAt(x, y) {
    const hit = this.clipAt(x, y);
    if (hit) { const cl = this.app.project.playlist.clips; cl.splice(cl.indexOf(hit.c), 1); this.draw(); }
  }
}
