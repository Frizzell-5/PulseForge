// Instrument editor dialog for a channel.
import { h, paramRow } from './widgets.js';
import { DRUM_KITS, SYNTH_PRESETS, COLORS, noteName } from '../state.js';

const SYNTH_PARAMS = {
  voices: [1, 7, 1], detune: [0, 50, 1], cutoff: [60, 18000, 10], res: [0, 20, 0.1],
  attack: [0.001, 2, 0.001], decay: [0.01, 3, 0.01], sustain: [0, 1, 0.01], release: [0.01, 4, 0.01],
  octave: [-2, 2, 1], filterEnv: [0, 1, 0.01], drive: [0, 1, 0.01],
};
const FM_PARAMS = { ratio: [0.5, 8, 0.5], index: [0, 12, 0.1], attack: [0.001, 2, 0.001], decay: [0.01, 3, 0.01], sustain: [0, 1, 0.01], release: [0.01, 4, 0.01], octave: [-2, 2, 1] };
const DRUM_PARAMS = { tune: [-12, 12, 1], decay: [0.2, 3, 0.05], tone: [0, 1, 0.01] };

export function openEditor(app, ch) {
  const card = h('div');
  const rerender = () => card.replaceChildren(...build());
  const set = (k, v) => app.live(() => ch.params[k] = v);
  const rows = spec => Object.entries(spec).map(([k, r]) => paramRow(k, ch.params[k] ?? r[0], r, v => set(k, v), () => app.endLive()));

  const keyboard = () => {
    const kb = h('div', { style: { display: 'flex', gap: '2px', marginTop: '12px', touchAction: 'none' } });
    for (let p = 48; p < 72; p++) {
      const black = [1, 3, 6, 8, 10].includes(p % 12);
      const k = h('button', { title: noteName(p), style: {
        flex: '1', height: black ? '44px' : '64px', padding: 0, borderRadius: '0 0 5px 5px',
        background: black ? 'var(--black-key)' : 'var(--white-key)', border: '1px solid var(--line)', alignSelf: 'flex-start',
      } });
      k.addEventListener('pointerdown', e => { e.preventDefault(); k.style.background = ch.color; app.engine.noteOn(ch, p, 0.85); });
      const off = () => { k.style.background = black ? 'var(--black-key)' : 'var(--white-key)'; app.engine.noteOff(ch, p); };
      k.addEventListener('pointerup', off); k.addEventListener('pointerleave', off);
      kb.append(k);
    }
    return kb;
  };

  const build = () => {
    const out = [
      h('h1', {}, 'Instrument — ', h('span', { style: { color: ch.color } }, ch.name)),
      h('p', { class: 'lead' }, `Type: ${ch.type}. Changes are heard live. Play the keyboard below (or your computer keyboard / MIDI controller).`),
      h('div', { class: 'tabs' },
        h('input', { class: 'chip', value: ch.name, onchange: e => app.commit(() => ch.name = e.target.value) }),
        ...COLORS.map(c => h('button', { class: 'chip', style: { background: c, width: '24px' }, title: c, onclick: () => { app.commit(() => ch.color = c); rerender(); } }, ' ')),
      ),
    ];
    if (ch.type === 'drum') {
      out.push(h('div', { class: 'tabs' }, ...DRUM_KITS.map(k => h('button', { class: 'chip' + (ch.params.kit === k ? ' on' : ''), onclick: () => { app.commit(() => ch.params.kit = k); app.engine.preview(ch); rerender(); } }, k))));
      out.push(h('div', { class: 'ed-grid' }, ...rows(DRUM_PARAMS)));
    }
    if (ch.type === 'synth') {
      out.push(h('div', { class: 'tabs' }, ...Object.keys(SYNTH_PRESETS).map(p => h('button', { class: 'chip' + (ch.params.preset === p ? ' on' : ''), onclick: () => {
        app.commit(() => ch.params = { ...SYNTH_PRESETS[p], preset: p }); app.engine.preview(ch, 60, 0.4); rerender();
      } }, p))));
      if (!ch.params.fm) out.push(h('div', { class: 'tabs' }, ...['sawtooth', 'square', 'triangle', 'sine'].map(w => h('button', { class: 'chip' + (ch.params.wave === w ? ' on' : ''), onclick: () => { app.commit(() => ch.params.wave = w); rerender(); } }, w))));
      out.push(h('div', { class: 'ed-grid' }, ...rows(ch.params.fm ? FM_PARAMS : SYNTH_PARAMS)));
    }
    if (ch.type === 'sampler') {
      const samples = [...app.bank.items.values()];
      out.push(h('div', { class: 'tabs' },
        h('select', { class: 'chip', onchange: e => app.commit(() => ch.params.sampleId = e.target.value) },
          samples.length ? samples.map(s => h('option', { value: s.id, selected: s.id === ch.params.sampleId }, s.name)) : h('option', {}, 'No samples loaded')),
        h('button', { class: 'chip', onclick: () => app.importSample(ch) }, 'Load file…'),
        h('button', { class: 'chip' + (ch.params.reverse ? ' on' : ''), onclick: () => { app.commit(() => ch.params.reverse = !ch.params.reverse); rerender(); } }, '⇆ Reverse'),
        h('button', { class: 'chip' + (ch.params.oneShot ? ' on' : ''), title: 'One-shot plays the whole sample; off = gated by note length', onclick: () => { app.commit(() => ch.params.oneShot = !ch.params.oneShot); rerender(); } }, 'One-shot')));
      out.push(h('div', { class: 'ed-grid' },
        paramRow('root note', ch.root, [24, 96, 1], v => app.live(() => ch.root = v), () => app.endLive(), v => noteName(+v)),
        ...rows({ attack: [0.001, 1, 0.001], release: [0.01, 2, 0.01] })));
    }
    out.push(keyboard());
    out.push(h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => { app.select(ch.id); app.closeModal(); app.wm.show('pianoroll'); } }, 'Open Piano Roll'),
      h('button', { class: 'btn primary', onclick: () => app.closeModal() }, 'Done')));
    return out;
  };
  rerender();
  app.showModal(card);
}
