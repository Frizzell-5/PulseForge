// Piano Roll: canvas note editor with snap, scale lock, chord stamps, velocity lane and generators.
import { h, fitCanvas, css } from './widgets.js';
import { uid, SCALES, NOTE_NAMES, noteName } from '../state.js';

const KEYW = 52, HEAD = 22, VELH = 64;
const CHORDS = { 'None': [0], 'Major': [0, 4, 7], 'Minor': [0, 3, 7], 'Maj7': [0, 4, 7, 11], 'Min7': [0, 3, 7, 10], 'Dom7': [0, 4, 7, 10], 'Sus4': [0, 5, 7], 'Power': [0, 7, 12], 'Octave': [0, 12] };
const SNAPS = { '1/4 step': 0.25, '1/2 step': 0.5, 'Step (1/16)': 1, 'Beat': 4, 'Bar': 16, 'None': 0 };
const isBlack = p => [1, 3, 6, 8, 10].includes(p % 12);

export class PianoRoll {
  constructor(app, host, tools, titleEl) {
    this.app = app; this.host = host; this.tools = tools; this.titleEl = titleEl;
    this.canvas = h('canvas', { style: { touchAction: 'none', display: 'block' } });
    host.append(this.canvas);
    this.stepW = 28; this.rowH = 16; this.sx = 0; this.sy = (127 - 84) * 16;
    this.tool = 'draw'; this.snap = 1; this.chord = 'None'; this.lastLen = 1; this.showVel = true; this.ghosts = true;
    this.sel = new Set();
    this.drag = null;
    this.renderTools();
    this.bind();
  }

  get ch() { return this.app.project.channels.find(c => c.id === this.app.sel); }
  get notes() {
    const pat = this.app.pattern, ch = this.ch;
    if (!ch) return [];
    return pat.notes[ch.id] || (pat.notes[ch.id] = []);
  }

  renderTools() {
    const app = this.app, sc = app.project.scale;
    const tool = (id, label, tip) => h('button', { class: 'chip' + (this.tool === id ? ' on' : ''), title: tip, onclick: () => { this.tool = id; this.renderTools(); } }, label);
    const sel = (opts, value, onchange, title) => h('select', { class: 'chip', title, onchange: e => onchange(e.target.value) },
      Object.keys(opts).map(k => h('option', { value: k, selected: k === value }, k)));
    this.tools.replaceChildren(
      tool('draw', '✎ Draw', 'Draw: click to add, drag to move, drag right edge to resize, right-click to delete'),
      tool('select', '⬚ Select', 'Select: drag a box, then move or delete the selection'),
      tool('erase', '⌫ Erase', 'Erase notes'),
      tool('pan', '✋ Pan', 'Pan the view (useful on touch screens)'),
      sel(SNAPS, Object.keys(SNAPS).find(k => SNAPS[k] === this.snap), v => this.snap = SNAPS[v], 'Snap'),
      sel(CHORDS, this.chord, v => this.chord = v, 'Chord stamp: each click places a whole chord'),
      h('select', { class: 'chip', title: 'Scale root', onchange: e => app.commit(() => sc.root = +e.target.value, false) },
        NOTE_NAMES.map((n, i) => h('option', { value: i, selected: i === sc.root }, n))),
      sel(SCALES, sc.name, v => app.commit(() => sc.name = v, false), 'Scale (highlighted rows)'),
      h('button', { class: 'chip' + (sc.lock ? ' on' : ''), title: 'Scale lock: notes snap to the scale', onclick: () => { app.commit(() => sc.lock = !sc.lock, false); this.renderTools(); } }, '🔒 Lock'),
      h('button', { class: 'chip', title: 'Quantize selection (or all) to snap (Q)', onclick: () => this.quantize() }, 'Quantize'),
      h('button', { class: 'chip', title: 'Generate a melody in the current scale', onclick: () => this.generate() }, '✨ Melody'),
      h('button', { class: 'chip', title: 'Generate a chord progression in the current scale', onclick: () => this.generateChords() }, '✨ Chords'),
      h('button', { class: 'chip' + (this.ghosts ? ' on' : ''), title: 'Show other channels as ghost notes', onclick: () => { this.ghosts = !this.ghosts; this.renderTools(); this.draw(); } }, '👻'),
      h('button', { class: 'chip' + (this.showVel ? ' on' : ''), title: 'Velocity lane', onclick: () => { this.showVel = !this.showVel; this.renderTools(); this.draw(); } }, 'Vel'),
    );
  }

  // ----- geometry -----
  y(p) { return HEAD + (127 - p) * this.rowH - this.sy; }
  x(s) { return KEYW + s * this.stepW - this.sx; }
  pAt(y) { return Math.floor(127 - (y - HEAD + this.sy) / this.rowH); }
  sAt(x) { return (x - KEYW + this.sx) / this.stepW; }
  snapS(s, mode = Math.floor) { return this.snap ? mode(s / this.snap) * this.snap : s; }
  gridH() { return this.H - (this.showVel ? VELH : 0); }
  scalePitch(p) {
    const sc = this.app.project.scale;
    if (!sc.lock) return p;
    const deg = SCALES[sc.name];
    for (let d = 0; d < 12; d++) for (const q of [p - d, p + d]) if (deg.includes(((q - sc.root) % 12 + 12) % 12)) return q;
    return p;
  }
  hit(x, y) {
    const notes = this.notes;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i], nx = this.x(n.s), ny = this.y(n.p), nw = n.l * this.stepW;
      if (x >= nx && x <= nx + nw && y >= ny && y < ny + this.rowH) return { n, edge: x > nx + nw - Math.min(8, nw / 3) };
    }
    return null;
  }

  // ----- rendering -----
  draw() {
    const { w, h: H, dpr } = fitCanvas(this.canvas, this.host);
    this.W = w; this.H = H;
    const g = this.canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const app = this.app, pat = app.pattern, ch = this.ch, sc = app.project.scale, deg = SCALES[sc.name];
    this.titleEl.textContent = ch ? `Piano Roll — ${ch.name}` : 'Piano Roll';
    const GH = this.gridH();
    g.fillStyle = css('--panel'); g.fillRect(0, 0, w, H);
    g.save(); g.beginPath(); g.rect(KEYW, HEAD, w - KEYW, GH - HEAD); g.clip();
    // rows
    const pTop = this.pAt(HEAD), pBot = this.pAt(GH);
    for (let p = pTop; p >= Math.max(0, pBot); p--) {
      const y = this.y(p);
      const inScale = deg.includes(((p - sc.root) % 12 + 12) % 12);
      g.fillStyle = isBlack(p) ? css('--row-black') : 'rgba(255,255,255,.015)';
      g.fillRect(KEYW, y, w, this.rowH);
      if (sc.name !== 'Chromatic' && inScale) { g.fillStyle = 'rgba(92,242,160,.05)'; g.fillRect(KEYW, y, w, this.rowH); }
      if (p % 12 === 0) { g.fillStyle = css('--grid-strong'); g.fillRect(KEYW, y + this.rowH - 1, w, 1); }
    }
    // columns
    const s0 = Math.max(0, Math.floor(this.sAt(KEYW))), s1 = Math.ceil(this.sAt(w));
    for (let s = s0; s <= s1; s++) {
      g.fillStyle = s % 16 === 0 ? css('--grid-strong') : s % 4 === 0 ? 'rgba(127,127,127,.18)' : css('--grid');
      g.fillRect(Math.round(this.x(s)), HEAD, 1, GH);
    }
    // outside pattern
    g.fillStyle = css('--outside'); g.fillRect(this.x(pat.steps), HEAD, w, GH);
    // ghosts
    if (this.ghosts) {
      g.globalAlpha = 0.18;
      app.project.channels.forEach(c => {
        if (ch && c.id === ch.id) return;
        g.fillStyle = c.color;
        (pat.notes[c.id] || []).forEach(n => { if (c.type !== 'drum') g.fillRect(this.x(n.s), this.y(n.p) + 1, n.l * this.stepW - 1, this.rowH - 2); });
      });
      g.globalAlpha = 1;
    }
    // notes
    if (ch) this.notes.forEach(n => {
      const x = this.x(n.s), y = this.y(n.p), nw = Math.max(3, n.l * this.stepW - 1);
      g.globalAlpha = 0.45 + n.v * 0.55;
      g.fillStyle = ch.color;
      rr(g, x, y + 1, nw, this.rowH - 2, 3); g.fill();
      g.globalAlpha = 1;
      if (this.sel.has(n.id)) { g.strokeStyle = css('--text'); g.lineWidth = 2; rr(g, x, y + 1, nw, this.rowH - 2, 3); g.stroke(); }
      if (this.rowH >= 13 && nw > 26) { g.fillStyle = 'rgba(0,0,0,.65)'; g.font = '10px system-ui'; g.fillText(noteName(n.p), x + 4, y + this.rowH - 4); }
    });
    // rubber band
    if (this.drag && this.drag.type === 'box') {
      const d = this.drag; g.strokeStyle = css('--accent'); g.setLineDash([4, 3]);
      g.strokeRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0); g.setLineDash([]);
    }
    // playhead
    if (this.play != null) { g.fillStyle = css('--ok'); g.fillRect(this.x(this.play % pat.steps), HEAD, 2, GH); }
    g.restore();

    // keyboard
    g.save(); g.beginPath(); g.rect(0, HEAD, KEYW, GH - HEAD); g.clip();
    for (let p = pTop; p >= Math.max(0, pBot); p--) {
      const y = this.y(p);
      g.fillStyle = isBlack(p) ? css('--black-key') : css('--white-key');
      g.fillRect(0, y, KEYW - 1, this.rowH - 1);
      if (this.pressed === p) { g.fillStyle = css('--accent'); g.fillRect(0, y, KEYW - 1, this.rowH - 1); }
      if (p % 12 === 0 && this.rowH >= 10) { g.fillStyle = '#333'; g.font = '10px system-ui'; g.fillText(noteName(p), KEYW - 26, y + this.rowH - 3); }
    }
    g.restore();
    // header
    g.fillStyle = css('--panel2'); g.fillRect(0, 0, w, HEAD);
    g.fillStyle = css('--muted'); g.font = '11px system-ui';
    for (let s = s0 - (s0 % 4); s <= s1; s += 4) {
      const x = this.x(s); if (x < KEYW) continue;
      g.fillRect(x, s % 16 ? 14 : 6, 1, HEAD);
      if (s % 16 === 0) g.fillText(String(s / 16 + 1), x + 4, 14);
      else if (this.stepW > 14) g.fillText(`${Math.floor(s / 16) + 1}.${(s % 16) / 4 + 1}`, x + 3, 14);
    }
    // velocity lane
    if (this.showVel) {
      const top = GH;
      g.fillStyle = css('--panel2'); g.fillRect(0, top, w, VELH);
      g.fillStyle = css('--grid-strong'); g.fillRect(0, top, w, 1);
      g.fillStyle = css('--muted'); g.fillText('Vel', 12, top + 18);
      if (ch) this.notes.forEach(n => {
        const x = this.x(n.s); if (x < KEYW) return;
        const bh = (VELH - 10) * n.v;
        g.fillStyle = this.sel.has(n.id) ? css('--text') : ch.color;
        g.fillRect(x, top + VELH - 4 - bh, 3, bh);
        g.beginPath(); g.arc(x + 1.5, top + VELH - 4 - bh, 3, 0, 7); g.fill();
      });
    }
    if (!ch) {
      g.fillStyle = css('--muted'); g.font = '14px system-ui';
      g.fillText('Select a channel in the Channel Rack to edit its notes.', KEYW + 20, HEAD + 40);
    }
  }

  setPlayhead(step) { const s = step == null ? null : step; if (s !== this.play) { this.play = s; this.draw(); } }

  // ----- interaction -----
  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey) this.rowH = Math.max(6, Math.min(32, this.rowH - Math.sign(e.deltaY)));
        else { const s = this.sAt(e.offsetX); this.stepW = Math.max(6, Math.min(120, this.stepW * (e.deltaY > 0 ? 0.9 : 1.1))); this.sx = Math.max(0, s * this.stepW - (e.offsetX - KEYW)); }
      } else if (e.shiftKey) this.sx = Math.max(0, this.sx + (e.deltaY || e.deltaX));
      else { this.sx = Math.max(0, this.sx + e.deltaX); this.sy = Math.max(0, Math.min(128 * this.rowH - this.gridH() + HEAD, this.sy + e.deltaY)); }
      this.draw();
    }, { passive: false });

    c.addEventListener('pointerdown', e => this.down(e));
    c.addEventListener('pointermove', e => this.move(e));
    const up = e => this.up(e);
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('dblclick', e => {
      const hit = this.hit(e.offsetX, e.offsetY);
      if (hit && this.tool === 'select') { this.sel = new Set([hit.n.id]); this.draw(); }
    });
  }

  down(e) {
    const app = this.app, ch = this.ch, x = e.offsetX, y = e.offsetY;
    this.canvas.setPointerCapture(e.pointerId);
    if (this.tool === 'pan' || e.button === 1) { this.drag = { type: 'pan', x, y, sx: this.sx, sy: this.sy }; return; }
    if (x < KEYW && y > HEAD && y < this.gridH()) {
      const p = this.pAt(y); this.pressed = p; this.draw();
      if (ch) app.engine.noteOn(ch, p, 0.8);
      this.drag = { type: 'key', p }; return;
    }
    if (!ch) return;
    if (this.showVel && y > this.gridH()) { app.checkpoint(); this.drag = { type: 'vel' }; this.velAt(x, y); return; }
    if (y < HEAD) return;
    const hit = this.hit(x, y);
    if (e.button === 2 || this.tool === 'erase') { app.checkpoint(); this.drag = { type: 'erase' }; this.eraseAt(x, y); return; }
    if (hit) {
      app.checkpoint();
      if (!this.sel.has(hit.n.id)) this.sel = new Set(e.shiftKey ? [...this.sel, hit.n.id] : [hit.n.id]);
      const group = this.notes.filter(n => this.sel.has(n.id));
      if (hit.edge) { this.drag = { type: 'resize', group: group.map(n => ({ n, l: n.l })), s: this.sAt(x) }; }
      else {
        this.drag = { type: 'move', group: group.map(n => ({ n, s: n.s, p: n.p })), s: this.sAt(x), p: this.pAt(y), lastP: hit.n.p };
        this.lastLen = hit.n.l;
        app.engine.preview(ch, hit.n.p, 0.2, hit.n.v);
      }
      this.draw(); return;
    }
    if (this.tool === 'select') { this.drag = { type: 'box', x0: x, y0: y, x1: x, y1: y }; this.sel.clear(); return; }
    // draw tool: create note(s)
    app.checkpoint();
    const s = Math.max(0, this.snapS(this.sAt(x))), root = this.scalePitch(this.pAt(y));
    const created = CHORDS[this.chord].map(iv => ({ id: uid(), s, l: this.lastLen, p: this.chord === 'None' ? root : this.scalePitch(root + iv), v: 0.8 }));
    this.notes.push(...created);
    this.sel = new Set(created.map(n => n.id));
    created.forEach(n => app.engine.preview(ch, n.p, 0.2));
    this.drag = { type: 'move', group: created.map(n => ({ n, s: n.s, p: n.p })), s: this.sAt(x), p: this.pAt(y), lastP: root, created: true };
    this.draw();
  }

  move(e) {
    const d = this.drag, x = e.offsetX, y = e.offsetY;
    if (!d) {
      const hit = this.tool !== 'pan' && this.hit(x, y);
      this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : hit ? (hit.edge ? 'ew-resize' : 'move') : x < KEYW ? 'pointer' : this.tool === 'erase' ? 'not-allowed' : 'crosshair';
      return;
    }
    if (d.type === 'pan') { this.sx = Math.max(0, d.sx - (x - d.x)); this.sy = Math.max(0, d.sy - (y - d.y)); }
    else if (d.type === 'key') {
      const p = this.pAt(y);
      if (p !== d.p && this.ch) { this.app.engine.noteOff(this.ch, d.p); this.app.engine.noteOn(this.ch, p, 0.8); d.p = p; this.pressed = p; }
    }
    else if (d.type === 'erase') this.eraseAt(x, y);
    else if (d.type === 'vel') this.velAt(x, y);
    else if (d.type === 'box') { d.x1 = x; d.y1 = y; this.boxSelect(); }
    else if (d.type === 'move') {
      const ds = this.snap ? Math.round((this.sAt(x) - d.s) / this.snap) * this.snap : this.sAt(x) - d.s;
      const dp = this.pAt(y) - d.p;
      d.group.forEach(g => { g.n.s = Math.max(0, g.s + ds); g.n.p = Math.max(0, Math.min(127, this.scalePitch(g.p + dp))); });
      const lead = d.group[0].n.p;
      if (lead !== d.lastP && this.ch) { d.lastP = lead; this.app.engine.preview(this.ch, lead, 0.15); }
    }
    else if (d.type === 'resize') {
      const dl = this.sAt(x) - d.s;
      d.group.forEach(g => { g.n.l = Math.max(this.snap || 0.125, this.snap ? Math.round((g.l + dl) / this.snap) * this.snap : g.l + dl); });
      this.lastLen = d.group[0].n.l;
    }
    this.draw();
  }

  up() {
    const d = this.drag; this.drag = null;
    if (!d) return;
    if (d.type === 'key') { if (this.ch) this.app.engine.noteOff(this.ch, d.p); this.pressed = null; }
    if (['move', 'resize', 'erase', 'vel'].includes(d.type)) this.app.changed();
    this.draw();
  }

  eraseAt(x, y) {
    const hit = this.hit(x, y);
    if (hit) { const arr = this.notes; arr.splice(arr.indexOf(hit.n), 1); this.sel.delete(hit.n.id); this.draw(); }
  }
  velAt(x, y) {
    const top = this.gridH();
    const v = Math.max(0.05, Math.min(1, (top + VELH - 4 - y) / (VELH - 10)));
    const targets = this.notes.filter(n => Math.abs(this.x(n.s) - x) < Math.max(4, this.stepW / 2) && (!this.sel.size || this.sel.has(n.id)));
    targets.forEach(n => n.v = v);
    this.draw();
  }
  boxSelect() {
    const d = this.drag, [ax, bx] = [Math.min(d.x0, d.x1), Math.max(d.x0, d.x1)], [ay, by] = [Math.min(d.y0, d.y1), Math.max(d.y0, d.y1)];
    this.sel = new Set(this.notes.filter(n => {
      const nx = this.x(n.s), ny = this.y(n.p);
      return nx + n.l * this.stepW > ax && nx < bx && ny + this.rowH > ay && ny < by;
    }).map(n => n.id));
  }

  // ----- commands -----
  selected() { const s = this.notes.filter(n => this.sel.has(n.id)); return s.length ? s : this.notes; }
  quantize() { const q = this.snap || 1; this.app.commit(() => this.selected().forEach(n => { n.s = Math.round(n.s / q) * q; n.l = Math.max(q, Math.round(n.l / q) * q); })); }
  transpose(semi) { this.app.commit(() => this.selected().forEach(n => n.p = Math.max(0, Math.min(127, n.p + semi)))); }
  nudge(ds) { this.app.commit(() => this.selected().forEach(n => n.s = Math.max(0, n.s + ds))); }
  deleteSel() { if (!this.sel.size) return; this.app.commit(() => { const arr = this.notes; for (let i = arr.length - 1; i >= 0; i--) if (this.sel.has(arr[i].id)) arr.splice(i, 1); }); this.sel.clear(); }
  duplicateSel() {
    const src = this.notes.filter(n => this.sel.has(n.id)); if (!src.length) return;
    const start = Math.min(...src.map(n => n.s)), end = Math.max(...src.map(n => n.s + n.l));
    const span = Math.ceil((end - start) / 4) * 4 || 4;
    this.app.commit(() => {
      const copies = src.map(n => ({ ...n, id: uid(), s: n.s + span }));
      this.notes.push(...copies); this.sel = new Set(copies.map(n => n.id));
    });
  }
  selectAll() { this.sel = new Set(this.notes.map(n => n.id)); this.draw(); }

  scaleNotes(lo, hi) {
    const sc = this.app.project.scale, deg = SCALES[sc.name], out = [];
    for (let p = lo; p <= hi; p++) if (deg.includes(((p - sc.root) % 12 + 12) % 12)) out.push(p);
    return out;
  }
  generate() {
    const ch = this.ch; if (!ch) return this.app.toast('Select a channel first');
    const steps = this.app.pattern.steps, pool = this.scaleNotes(60, 84);
    let i = Math.floor(pool.length / 3), s = 0;
    const rhythm = [1, 1, 2, 2, 2, 3, 4];
    const motif = [];
    while (s < steps / 2) {
      const l = rhythm[Math.floor(Math.random() * rhythm.length)];
      i = Math.max(0, Math.min(pool.length - 1, i + [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(Math.random() * 8)]));
      if (Math.random() > 0.15) motif.push({ s, l: Math.min(l, steps / 2 - s), i });
      s += l;
    }
    this.app.commit(() => {
      const arr = this.app.pattern.notes[ch.id] = [];
      // call and response: repeat the motif with a varied ending
      motif.forEach(m => arr.push({ id: uid(), s: m.s, l: m.l, p: pool[m.i], v: 0.7 + Math.random() * 0.3 }));
      motif.forEach((m, k) => {
        const vary = k >= motif.length - 2 ? [-2, -1, 1][Math.floor(Math.random() * 3)] : 0;
        const ii = Math.max(0, Math.min(pool.length - 1, m.i + vary));
        arr.push({ id: uid(), s: m.s + steps / 2, l: m.l, p: pool[ii], v: 0.7 + Math.random() * 0.3 });
      });
    });
    this.app.toast('✨ New melody generated — press Ctrl+Z to undo');
  }
  generateChords() {
    const ch = this.ch; if (!ch) return this.app.toast('Select a channel first');
    const sc = this.app.project.scale, deg = SCALES[sc.name].length >= 7 ? SCALES[sc.name] : SCALES.Minor;
    const progs = [[0, 5, 3, 4], [0, 3, 4, 3], [0, 4, 5, 3], [5, 3, 0, 4], [0, 6, 5, 4], [0, 2, 3, 4]];
    const prog = progs[Math.floor(Math.random() * progs.length)];
    const steps = this.app.pattern.steps, each = steps / 4;
    const tone = (d, o) => 48 + sc.root + deg[d % 7] + 12 * (Math.floor(d / 7) + o);
    this.app.commit(() => {
      const arr = this.app.pattern.notes[ch.id] = [];
      prog.forEach((d, k) => [0, 2, 4].forEach(st => arr.push({ id: uid(), s: k * each, l: each, p: tone(d + st, 1), v: 0.7 })));
    });
    this.app.toast('✨ New chord progression — press Ctrl+Z to undo');
  }

  handleKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSel(); return true; }
    if (mod && e.key.toLowerCase() === 'a') { this.selectAll(); return true; }
    if (mod && e.key.toLowerCase() === 'd') { this.duplicateSel(); return true; }
    if (!mod && e.key.toLowerCase() === 'q' && e.altKey) { this.quantize(); return true; }
    if (e.key === 'ArrowUp' && this.sel.size) { this.transpose(e.shiftKey ? 12 : 1); return true; }
    if (e.key === 'ArrowDown' && this.sel.size) { this.transpose(e.shiftKey ? -12 : -1); return true; }
    if (e.key === 'ArrowLeft' && this.sel.size) { this.nudge(-(this.snap || 1)); return true; }
    if (e.key === 'ArrowRight' && this.sel.size) { this.nudge(this.snap || 1); return true; }
    return false;
  }

  focusNotes() {
    const notes = this.notes;
    const center = notes.length ? notes.reduce((a, n) => a + n.p, 0) / notes.length : (this.ch && this.ch.root) || 60;
    this.sy = Math.max(0, (127 - center) * this.rowH - (this.gridH() - HEAD) / 2);
    this.sx = 0;
  }
}

function rr(g, x, y, w, hh, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
