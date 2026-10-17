// Browser panel: instruments, presets, effects, projects and layouts.
import { h } from './widgets.js';
import { DRUM_KITS, SYNTH_PRESETS, FX_TYPES, makeFx } from '../state.js';
import { LAYOUTS } from './windows.js';

export class Browser {
  constructor(app, el) { this.app = app; this.el = el; }

  render() {
    const app = this.app;
    const item = (icon, label, onclick, hint) => h('button', { class: 'br-item', onclick, title: hint || label }, h('i', {}, icon), label, hint ? h('small', {}, hint) : null);
    const group = (title, ...items) => h('div', { class: 'br-group' }, h('h5', {}, title), ...items);
    const samples = [...app.bank.items.values()];
    this.el.replaceChildren(
      group('Drums', ...DRUM_KITS.map(k => item('◉', k[0].toUpperCase() + k.slice(1), () => app.addChannel('drum', k)))),
      group('Synths', ...Object.keys(SYNTH_PRESETS).map(p => item('∿', p, () => app.addChannel('synth', p)))),
      group('Samples',
        item('⇪', 'Import audio file…', () => app.importSample()),
        item('●', 'Record from microphone', () => app.recordMic()),
        ...samples.map(s => item('▸', s.name, () => app.addChannel('sampler', s.id), s.duration.toFixed(1) + 's'))),
      group('Effects → selected mixer track', ...Object.entries(FX_TYPES).map(([k, v]) => item('⚙', v.name, () => {
        const i = app.mixer.selected;
        app.commit(() => app.project.mixer[i].fx.push(makeFx(k)));
        app.engine.rebuildFx(i);
        app.toast(`${v.name} added to ${i === 0 ? 'Master' : app.project.mixer[i].name}`);
        app.wm.show('mixer');
      }))),
      group('Project',
        item('✦', 'New empty project', () => app.newProject()),
        item('★', 'Load demo song', () => app.loadDemo()),
        item('📂', 'Open project file…', () => app.openFile()),
        item('💾', 'Save project file', () => app.saveFile())),
      group('Workspace layouts', ...Object.entries(LAYOUTS).map(([k, l]) => item('▦', l.label, () => app.wm.apply(k)))),
    );
  }
}
