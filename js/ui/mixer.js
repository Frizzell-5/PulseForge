// Mixer: insert tracks with faders, pan, mute/solo, peak meters, spectrum and effect chains.
import { h, knob, paramRow, css } from './widgets.js';
import { FX_TYPES, PARAM_RANGES, makeFx, makeMixerTrack } from '../state.js';

const FILTER_TYPES = ['Low-pass', 'High-pass', 'Band-pass'];

export class Mixer {
  constructor(app, el) {
    this.app = app; this.el = el;
    this.selected = 0;
    this.meters = [];
    this.buf = new Float32Array(2048);
    this.peaks = [];
  }

  render() {
    const app = this.app, pr = app.project;
    this.meters = [];
    const strips = pr.mixer.map((m, i) => {
      const meter = h('canvas', { width: 12, height: 120 });
      this.meters[i] = meter;
      const fader = h('input', { class: 'fader', type: 'range', min: 0, max: 1.25, step: 0.01, value: m.vol, title: 'Volume' });
      fader.addEventListener('input', () => app.live(() => m.vol = +fader.value));
      fader.addEventListener('change', () => app.endLive());
      fader.addEventListener('dblclick', () => { fader.value = 0.8; app.live(() => m.vol = 0.8); app.endLive(); });
      const routed = pr.channels.filter(c => c.mixer === i);
      return h('div', {
        class: 'strip' + (i === 0 ? ' master' : '') + (this.selected === i ? ' sel' : ''),
        title: routed.length ? 'Channels: ' + routed.map(c => c.name).join(', ') : (i === 0 ? 'Master output' : 'No channels routed here'),
        onclick: () => { if (this.selected !== i) { this.selected = i; this.render(); } },
      },
        h('div', { class: 'nm', ondblclick: () => { const n = prompt('Track name', m.name); if (n) app.commit(() => m.name = n); } }, i === 0 ? 'MASTER' : `${i} · ${m.name}`),
        knob({ value: m.pan, min: -1, max: 1, def: 0, title: 'Pan', onInput: v => app.live(() => m.pan = v), onCommit: () => app.endLive() }),
        h('div', { class: 'fader-wrap' }, fader, meter),
        h('div', { class: 'row' },
          h('button', { class: 'solo' + (m.mute ? ' on' : ''), title: 'Mute', onclick: e => { e.stopPropagation(); app.commit(() => m.mute = !m.mute); } }, 'M'),
          i > 0 ? h('button', { class: 'solo' + (m.solo ? ' on' : ''), title: 'Solo', onclick: e => { e.stopPropagation(); app.commit(() => m.solo = !m.solo); } }, 'S') : null),
        h('div', { class: 'fxcount' }, m.fx.length ? `${m.fx.length} FX` : '—'),
      );
    });
    const addTrack = h('button', { class: 'chip', style: { alignSelf: 'flex-start' }, title: 'Add a mixer track', onclick: () => {
      app.commit(() => pr.mixer.push(makeMixerTrack(pr.mixer.length)));
      app.engine.rebuild();
    } }, '＋');
    this.el.replaceChildren(...strips, addTrack, this.fxPanel());
  }

  fxPanel() {
    const app = this.app, pr = app.project, i = Math.min(this.selected, pr.mixer.length - 1), m = pr.mixer[i];
    this.spec = h('canvas', { height: 60, style: { width: '100%', height: '60px', borderRadius: '6px', background: '#05060a', display: 'block', marginBottom: '8px' } });
    const add = h('select', { class: 'chip', onchange: e => {
      if (!e.target.value) return;
      app.commit(() => m.fx.push(makeFx(e.target.value)));
      app.engine.rebuildFx(i);
    } }, h('option', { value: '' }, '＋ Add effect…'), Object.entries(FX_TYPES).map(([k, v]) => h('option', { value: k }, v.name)));
    const slots = m.fx.map((fx, k) => {
      const params = Object.entries(fx.params).map(([p, val]) => {
        const fmt = p === 'type' ? v => FILTER_TYPES[v | 0] : p === 'sync' ? v => (+v ? 'On' : 'Off') : undefined;
        return paramRow(p, val, PARAM_RANGES[p] || [0, 1, 0.01], v => { app.live(() => fx.params[p] = v); app.engine.updateFx(i); }, () => app.endLive(), fmt);
      });
      return h('div', { class: 'fx-slot' },
        h('header', {},
          h('input', { type: 'checkbox', checked: fx.on, title: 'Enable', onchange: () => { app.commit(() => fx.on = !fx.on, false); app.engine.rebuildFx(i); } }),
          h('span', {}, FX_TYPES[fx.type].name), h('span', { class: 'sp' }),
          h('button', { title: 'Move up', onclick: () => { if (k) { app.commit(() => m.fx.splice(k - 1, 0, ...m.fx.splice(k, 1))); app.engine.rebuildFx(i); } } }, '↑'),
          h('button', { title: 'Remove', onclick: () => { app.commit(() => m.fx.splice(k, 1)); app.engine.rebuildFx(i); } }, '✕')),
        ...params);
    });
    return h('div', { class: 'fx-panel' },
      h('h4', {}, h('span', {}, `${i === 0 ? 'Master' : m.name} — FX chain`), add),
      this.spec,
      ...(slots.length ? slots : [h('p', { style: { color: 'var(--muted)', fontSize: '12px' } }, 'No effects yet. Add EQ, compression, reverb, delay and more from the menu above.')]));
  }

  // Called every animation frame
  tick() {
    const eng = this.app.engine;
    if (!eng.graph) return;
    this.meters.forEach((cv, i) => {
      const an = eng.analyser(i); if (!an || !cv.isConnected) return;
      an.getFloatTimeDomainData(this.buf);
      let pk = 0; for (let k = 0; k < this.buf.length; k += 4) pk = Math.max(pk, Math.abs(this.buf[k]));
      this.peaks[i] = Math.max(pk, (this.peaks[i] || 0) * 0.92);
      const g = cv.getContext('2d'), H = cv.height, lv = Math.min(1, this.peaks[i]);
      g.clearRect(0, 0, 12, H);
      const grad = g.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0, '#5cf2a0'); grad.addColorStop(0.7, '#f5e663'); grad.addColorStop(1, '#ff4d4d');
      g.fillStyle = grad; g.fillRect(0, H - lv * H, 12, lv * H);
    });
    const an = eng.analyser(this.selected);
    if (an && this.spec && this.spec.isConnected) {
      const cv = this.spec, w = cv.clientWidth; if (cv.width !== w) cv.width = w;
      const data = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(data);
      const g = cv.getContext('2d'); g.clearRect(0, 0, w, 60);
      g.fillStyle = css('--accent');
      const bars = 64;
      for (let b = 0; b < bars; b++) {
        const lo = Math.floor(Math.pow(data.length, b / bars)), hi = Math.max(lo + 1, Math.floor(Math.pow(data.length, (b + 1) / bars)));
        let v = 0; for (let k = lo; k < hi; k++) v = Math.max(v, data[k]);
        const bh = v / 255 * 58;
        g.fillRect(b * w / bars, 60 - bh, w / bars - 1, bh);
      }
    }
  }
}
