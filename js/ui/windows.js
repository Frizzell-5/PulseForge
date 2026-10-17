// Dynamic workspace: floating, draggable, resizable panels with layout presets.
// On narrow screens panels become full-screen tabs.

export const LAYOUTS = {
  studio: {
    label: 'Studio (all-in-one)',
    browser:   [0, 0, 14, 100],
    playlist:  [14, 0, 86, 48],
    rack:      [14, 48, 40, 52],
    pianoroll: [54, 48, 46, 52],
    mixer: null,
  },
  beat: {
    label: 'Beat making',
    rack:      [0, 0, 46, 100],
    pianoroll: [46, 0, 54, 100],
    browser: null, playlist: null, mixer: null,
  },
  compose: {
    label: 'Compose (piano roll focus)',
    pianoroll: [0, 0, 100, 70],
    rack:      [0, 70, 100, 30],
    browser: null, playlist: null, mixer: null,
  },
  arrange: {
    label: 'Arrange',
    browser:  [0, 0, 15, 100],
    playlist: [15, 0, 85, 100],
    rack: null, pianoroll: null, mixer: null,
  },
  mix: {
    label: 'Mixing',
    mixer:    [0, 0, 100, 62],
    rack:     [0, 62, 45, 38],
    playlist: [45, 62, 55, 38],
    browser: null, pianoroll: null,
  },
};

const KEY = 'pf.layout.v1';
const mobile = () => window.matchMedia('(max-width: 820px)').matches;

export class WindowManager {
  constructor(root, onResize) {
    this.root = root;
    this.onResize = onResize;
    this.wins = {};
    this.z = 10;
    root.querySelectorAll('.win').forEach(w => {
      const id = w.dataset.panel;
      this.wins[id] = w;
      this.bind(w, id);
    });
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
    if (saved && saved.rects) this.restore(saved); else this.apply('studio');
    this.activeTab = (saved && saved.tab) || 'rack';
    this.setTab(this.activeTab);
    new ResizeObserver(() => this.onResize()).observe(root);
  }

  bind(w, id) {
    const title = w.querySelector('.win-title');
    w.addEventListener('pointerdown', () => this.focus(id));
    title.addEventListener('dblclick', e => { if (!e.target.closest('.win-tools, button, select')) this.toggleMax(id); });
    title.addEventListener('pointerdown', e => {
      if (mobile() || e.target.closest('.win-tools, .win-actions, button, select, input')) return;
      const r = this.root.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, ox = w.offsetLeft, oy = w.offsetTop;
      title.setPointerCapture(e.pointerId);
      const move = ev => {
        const x = Math.min(Math.max(ox + ev.clientX - sx, -w.offsetWidth + 80), r.width - 80);
        const y = Math.min(Math.max(oy + ev.clientY - sy, 0), r.height - 30);
        w.style.left = x + 'px'; w.style.top = y + 'px';
      };
      const up = () => { title.removeEventListener('pointermove', move); title.removeEventListener('pointerup', up); this.snap(w); this.save(); };
      title.addEventListener('pointermove', move); title.addEventListener('pointerup', up);
    });
    const rz = w.querySelector('.win-resize');
    rz.addEventListener('pointerdown', e => {
      e.stopPropagation();
      const sx = e.clientX, sy = e.clientY, ow = w.offsetWidth, oh = w.offsetHeight;
      rz.setPointerCapture(e.pointerId);
      const move = ev => { w.style.width = Math.max(220, ow + ev.clientX - sx) + 'px'; w.style.height = Math.max(120, oh + ev.clientY - sy) + 'px'; this.onResize(); };
      const up = () => { rz.removeEventListener('pointermove', move); rz.removeEventListener('pointerup', up); this.save(); this.onResize(); };
      rz.addEventListener('pointermove', move); rz.addEventListener('pointerup', up);
    });
    w.querySelector('[data-act=close]').onclick = () => this.hide(id);
    w.querySelector('[data-act=max]').onclick = () => this.toggleMax(id);
  }

  // Snap window edges to workspace edges and other windows (within 10px)
  snap(w) {
    const T = 10, W = this.root.clientWidth, H = this.root.clientHeight;
    let x = w.offsetLeft, y = w.offsetTop; const ww = w.offsetWidth, wh = w.offsetHeight;
    const xs = [0, W], ys = [0, H];
    Object.values(this.wins).forEach(o => {
      if (o === w || o.hidden) return;
      xs.push(o.offsetLeft, o.offsetLeft + o.offsetWidth); ys.push(o.offsetTop, o.offsetTop + o.offsetHeight);
    });
    for (const sx of xs) { if (Math.abs(x - sx) < T) x = sx; else if (Math.abs(x + ww - sx) < T) x = sx - ww; }
    for (const sy of ys) { if (Math.abs(y - sy) < T) y = sy; else if (Math.abs(y + wh - sy) < T) y = sy - wh; }
    w.style.left = x + 'px'; w.style.top = y + 'px';
  }

  focus(id) {
    const w = this.wins[id];
    if (!w) return;
    Object.values(this.wins).forEach(o => o.classList.remove('focused'));
    w.classList.add('focused');
    w.style.zIndex = ++this.z;
  }

  place(id, rect) {
    const w = this.wins[id];
    if (!rect) { w.hidden = true; return; }
    const [x, y, ww, hh] = rect;
    Object.assign(w.style, { left: x + '%', top: y + '%', width: ww + '%', height: hh + '%' });
    w.hidden = false;
  }

  apply(name) {
    const L = LAYOUTS[name];
    if (!L) return;
    Object.keys(this.wins).forEach(id => this.place(id, L[id] || null));
    this.save();
    requestAnimationFrame(() => this.onResize());
  }

  show(id) {
    if (mobile()) return this.setTab(id);
    const w = this.wins[id];
    if (w.hidden) {
      w.hidden = false;
      if (!w.style.width) this.place(id, [20, 10, 60, 70]);
    }
    this.focus(id);
    this.save();
    requestAnimationFrame(() => this.onResize());
  }
  hide(id) { this.wins[id].hidden = true; this.save(); }
  toggle(id) { const w = this.wins[id]; if (mobile()) return this.setTab(id); (w.hidden || !w.classList.contains('focused')) ? this.show(id) : this.hide(id); }

  toggleMax(id) {
    const w = this.wins[id];
    if (w.dataset.prev) { w.style.cssText = w.dataset.prev; delete w.dataset.prev; }
    else { w.dataset.prev = w.style.cssText; Object.assign(w.style, { left: '0', top: '0', width: '100%', height: '100%' }); }
    this.focus(id); this.save(); requestAnimationFrame(() => this.onResize());
  }

  setTab(id) {
    this.activeTab = id;
    Object.entries(this.wins).forEach(([k, w]) => w.classList.toggle('tab-on', k === id));
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
    if (mobile()) this.wins[id].hidden = false;
    this.save();
    requestAnimationFrame(() => this.onResize());
  }

  save() {
    const rects = {};
    Object.entries(this.wins).forEach(([id, w]) => rects[id] = { css: w.style.cssText, hidden: w.hidden });
    try { localStorage.setItem(KEY, JSON.stringify({ rects, tab: this.activeTab })); } catch {}
  }
  restore(s) {
    Object.entries(this.wins).forEach(([id, w]) => {
      const r = s.rects[id];
      if (!r) return;
      w.style.cssText = r.css; w.hidden = r.hidden;
    });
  }
}
