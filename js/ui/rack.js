// Channel Rack: per-channel step sequencer with mute/solo/volume/pan and mixer routing.
import { h, knob } from './widgets.js';
import { uid, DRUM_KITS, SYNTH_PRESETS } from '../state.js';

export class Rack {
  constructor(app, el, tools) {
    this.app = app; this.el = el; this.tools = tools;
    this.cols = [];
    this.renderTools();
  }

  renderTools() {
    const app = this.app;
    this.tools.replaceChildren(
      h('select', { class: 'chip', title: 'Pattern length', onchange: e => app.commit(() => { app.pattern.steps = +e.target.value; }) },
        [16, 32, 48, 64].map(n => h('option', { value: n }, `${n} steps`))),
      h('button', { class: 'chip', title: 'Add an instrument channel', onclick: e => app.addChannelMenu(e) }, '＋ Channel'),
      h('button', { class: 'chip', title: 'Generate a fresh drum groove for drum channels', onclick: () => app.generateBeat() }, '✨ Groove'),
      h('button', { class: 'chip', title: 'Duplicate this pattern', onclick: () => app.clonePattern() }, '⧉ Clone'),
      h('button', { class: 'chip', title: 'Clear the selected pattern', onclick: () => app.commit(() => { app.pattern.notes = {}; }) }, 'Clear'),
    );
  }

  isStepMode(ch, notes) {
    if (!notes || !notes.length) return true;
    return notes.every(n => n.p === ch.root && n.l <= 1 && Number.isInteger(n.s));
  }

  render() {
    const app = this.app, pr = app.project, pat = app.pattern;
    this.tools.querySelector('select').value = pat.steps;
    this.cols = Array.from({ length: pat.steps }, () => []);
    const rows = pr.channels.map((ch, idx) => {
      const notes = pat.notes[ch.id] || [];
      const row = h('div', { class: 'rack-row' + (app.sel === ch.id ? ' sel' : '') });
      row.style.setProperty('--c', ch.color); row.style.setProperty('--n', pat.steps);
      const led = h('button', { class: 'led' + (ch.mute ? ' off' : ''), title: 'Mute (click) ', onclick: () => app.commit(() => ch.mute = !ch.mute) });
      const solo = h('button', { class: 'solo' + (ch.solo ? ' on' : ''), title: 'Solo', onclick: () => app.commit(() => ch.solo = !ch.solo) }, 'S');
      const vol = knob({ value: ch.vol, min: 0, max: 1.2, def: 0.8, color: ch.color, title: 'Volume', onInput: v => app.live(() => ch.vol = v), onCommit: () => app.endLive() });
      const pan = knob({ value: ch.pan, min: -1, max: 1, def: 0, color: ch.color, title: 'Pan', onInput: v => app.live(() => ch.pan = v), onCommit: () => app.endLive() });
      const name = h('button', {
        class: 'ch-name', title: `${ch.name} — click to select & preview, double-click to edit, right-click for more`,
        onclick: () => { app.select(ch.id); app.engine.preview(ch, ch.root); },
        ondblclick: () => app.openEditor(ch),
        oncontextmenu: e => { e.preventDefault(); this.channelMenu(e, ch, idx); },
      }, ch.name);
      const mix = h('input', {
        class: 'mix-num', type: 'number', min: 0, max: pr.mixer.length - 1, value: ch.mixer, title: 'Mixer insert track',
        onchange: e => app.commit(() => ch.mixer = Math.max(0, Math.min(pr.mixer.length - 1, +e.target.value | 0))),
      });
      row.append(led, solo, vol, pan, name, mix);
      if (this.isStepMode(ch, notes)) row.append(this.steps(ch, notes, pat));
      else row.append(this.miniRoll(ch, notes, pat));
      return row;
    });
    const empty = pr.channels.length ? null : h('p', { style: { padding: '12px', color: 'var(--muted)' } }, 'No channels yet. Add one below or from the Browser.');
    const add = h('div', { class: 'rack-add' },
      ...['kick', 'snare', 'clap', 'hat'].map(k => h('button', { class: 'chip', onclick: () => app.addChannel('drum', k) }, '＋ ' + k)),
      h('button', { class: 'chip', onclick: () => app.addChannel('synth', 'Supersaw Lead') }, '＋ Synth'),
      h('button', { class: 'chip', onclick: () => app.importSample() }, '＋ Sample…'));
    this.el.replaceChildren(...rows, ...(empty ? [empty] : []), add);
  }

  steps(ch, notes, pat) {
    const app = this.app;
    const wrap = h('div', { class: 'steps' });
    const on = new Map(notes.map(n => [n.s, n]));
    let paint = null;
    const setStep = (i, state) => {
      const list = pat.notes[ch.id] || (pat.notes[ch.id] = []);
      const at = list.findIndex(n => n.s === i);
      if (state && at < 0) list.push({ id: uid(), s: i, l: 1, p: ch.root, v: 0.8 });
      if (!state && at >= 0) list.splice(at, 1);
    };
    for (let i = 0; i < pat.steps; i++) {
      const n = on.get(i);
      const b = h('button', { class: 'step' + (Math.floor(i / 4) % 2 ? ' alt' : '') + (n ? ' on' : '') + (n && n.v < 0.6 ? ' dim' : ''), title: `Step ${i + 1}` });
      b.dataset.i = i;
      this.cols[i].push(b);
      wrap.append(b);
    }
    wrap.addEventListener('contextmenu', e => e.preventDefault());
    wrap.addEventListener('pointerdown', e => {
      const b = e.target.closest('.step'); if (!b) return;
      e.preventDefault();
      app.checkpoint();
      const i = +b.dataset.i;
      paint = e.button === 2 ? false : !b.classList.contains('on');
      setStep(i, paint); b.classList.toggle('on', paint);
      if (paint) app.engine.preview(ch, ch.root);
      wrap.setPointerCapture(e.pointerId);
    });
    wrap.addEventListener('pointermove', e => {
      if (paint === null) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el.parentNode === wrap && el.classList.contains('on') !== paint) { setStep(+el.dataset.i, paint); el.classList.toggle('on', paint); }
    });
    const end = () => { if (paint !== null) { paint = null; app.changed(); } };
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
    // Mouse wheel over a lit step adjusts velocity
    wrap.addEventListener('wheel', e => {
      const b = e.target.closest('.step.on'); if (!b) return;
      e.preventDefault();
      const n = (pat.notes[ch.id] || []).find(x => x.s === +b.dataset.i);
      if (n) { n.v = Math.max(0.1, Math.min(1, n.v - Math.sign(e.deltaY) * 0.1)); b.classList.toggle('dim', n.v < 0.6); b.title = `Velocity ${Math.round(n.v * 100)}%`; app.changed(false); }
    }, { passive: false });
    return wrap;
  }

  miniRoll(ch, notes, pat) {
    const c = h('canvas', { class: 'mini-roll', title: 'Melodic pattern — click to open in the Piano Roll', onclick: () => { this.app.select(ch.id); this.app.wm.show('pianoroll'); } });
    requestAnimationFrame(() => {
      const dpr = devicePixelRatio || 1, w = c.clientWidth, hh = c.clientHeight;
      c.width = w * dpr; c.height = hh * dpr;
      const g = c.getContext('2d'); g.scale(dpr, dpr);
      const ps = notes.map(n => n.p), lo = Math.min(...ps) - 1, hi = Math.max(...ps) + 1;
      g.fillStyle = ch.color;
      notes.forEach(n => {
        const y = hh - ((n.p - lo) / Math.max(1, hi - lo)) * hh;
        g.fillRect(n.s / pat.steps * w, y - 2, Math.max(2, n.l / pat.steps * w - 1), 3);
      });
    });
    return c;
  }

  channelMenu(e, ch, idx) {
    const app = this.app, pr = app.project;
    const items = [
      ['Edit instrument…', () => app.openEditor(ch)],
      ['Open in Piano Roll', () => { app.select(ch.id); app.wm.show('pianoroll'); }],
      ['Rename…', () => { const n = prompt('Channel name', ch.name); if (n) app.commit(() => ch.name = n); }],
      ['Duplicate', () => app.commit(() => {
        const c = JSON.parse(JSON.stringify(ch)); c.id = uid(); c.name += ' 2';
        pr.channels.splice(idx + 1, 0, c);
      })],
      ['Move up', () => idx > 0 && app.commit(() => pr.channels.splice(idx - 1, 0, ...pr.channels.splice(idx, 1)))],
      ['Move down', () => idx < pr.channels.length - 1 && app.commit(() => pr.channels.splice(idx + 1, 0, ...pr.channels.splice(idx, 1)))],
      ['Route to free mixer track', () => app.commit(() => {
        const used = new Set(pr.channels.map(c => c.mixer));
        const free = pr.mixer.findIndex((m, i) => i > 0 && !used.has(i));
        if (free > 0) { ch.mixer = free; pr.mixer[free].name = ch.name; } else app.toast('No free mixer tracks');
      })],
      '-',
      ['Delete channel', () => app.commit(() => {
        pr.channels.splice(idx, 1);
        pr.patterns.forEach(p => delete p.notes[ch.id]);
      })],
    ];
    app.contextMenu(e, items);
  }

  highlight(step) {
    if (this.lastCol) this.lastCol.forEach(b => b.classList.remove('play'));
    this.lastCol = null;
    if (step == null) return;
    const col = this.cols[Math.floor(step) % (this.cols.length || 1)];
    if (col) { col.forEach(b => b.classList.add('play')); this.lastCol = col; }
  }
}

export { DRUM_KITS, SYNTH_PRESETS };
