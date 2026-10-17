// In-app user guide (shown on first launch) and the command palette.
import { h } from './widgets.js';

const SHORTCUTS = [
  ['Space', 'Play / stop'],
  ['Shift + L', 'Switch Pattern ↔ Song mode (plain L when typing-keyboard is off)'],
  ['Shift + R', 'Toggle note recording'],
  ['Shift + M', 'Toggle metronome'],
  ['Ctrl/⌘ + Z  ·  Ctrl/⌘ + Shift + Z', 'Undo · Redo'],
  ['Ctrl/⌘ + S  ·  Ctrl/⌘ + O', 'Save · open project file'],
  ['Ctrl/⌘ + E', 'Export song to WAV'],
  ['Ctrl/⌘ + K', 'Command palette: search every action'],
  ['F5 · F6 · F7 · F8 · F9', 'Playlist · Channel Rack · Piano Roll · Browser · Mixer'],
  ['F1', 'This guide'],
  ['Z S X D C V G B H N J M', 'Play notes (lower octave) on the selected channel'],
  ['Q 2 W 3 E R 5 T 6 Y 7 U I', 'Play notes (upper octave). Turn off in Tools → Typing keyboard'],
  ['[ and ]', 'Previous / next pattern'],
  ['Piano roll: Delete, Ctrl+A, Ctrl+D', 'Delete selection, select all, duplicate'],
  ['Piano roll: ↑ ↓ (Shift = octave), ← →', 'Transpose, nudge selected notes'],
  ['Piano roll: Ctrl + wheel / Ctrl + Shift + wheel', 'Zoom horizontally / vertically'],
];

export function guideContent(app, firstRun) {
  const sec = (title, ...kids) => [h('h2', {}, title), ...kids];
  let dontShow;
  return h('div', {},
    h('h1', {}, 'Welcome to PulseForge Studio'),
    h('p', { class: 'lead' }, 'A free, open-source music studio for every device: computer, browser, tablet and phone. Nothing to sign up for, and your projects stay on your device.'),
    ...sec('1 · Quick start (60 seconds)',
      h('ol', {},
        h('li', {}, 'Press ', h('b', {}, 'Space'), ' (or ▶) to hear the demo song. Click ', h('b', {}, 'SONG'), ' to hear the full arrangement.'),
        h('li', {}, 'In the ', h('b', {}, 'Channel Rack'), ', click the squares to switch drum steps on and off. Drag across them to paint.'),
        h('li', {}, 'Click a channel name to select it, then draw melodies in the ', h('b', {}, 'Piano Roll'), '. Try ✨ Melody or ✨ Chords for instant ideas.'),
        h('li', {}, 'Make patterns, then paint them into the ', h('b', {}, 'Playlist'), ' to build a song.'),
        h('li', {}, 'Shape the sound in the ', h('b', {}, 'Mixer'), ': EQ, compressor, reverb, delay, distortion, filter, chorus, bitcrusher and stereo widener.'),
        h('li', {}, h('b', {}, 'File → Export WAV'), ' to render your track. It also autosaves in your browser all the time.'))),
    ...sec('2 · The dynamic workspace',
      h('p', {}, 'Every panel is a window you can drag by its title bar, resize from the corner, maximize (double-click the title) or hide. Windows snap to each other\'s edges. Your layout is remembered. Jump between ready-made layouts from ', h('b', {}, 'View'), ': Studio, Beat making, Compose, Arrange and Mixing. On phones the panels become full-screen tabs along the bottom.')),
    ...sec('3 · How the parts fit together',
      h('ul', {},
        h('li', {}, h('b', {}, 'Channels'), ' are instruments: synthesized drums, subtractive and FM synths, and a sampler for your own audio or microphone recordings. Double-click a channel to edit its sound.'),
        h('li', {}, h('b', {}, 'Patterns'), ' hold notes for all channels. The rack steps and the piano roll edit the same notes.'),
        h('li', {}, h('b', {}, 'Playlist'), ' places patterns over time. PAT mode loops the current pattern; SONG mode plays the playlist.'),
        h('li', {}, h('b', {}, 'Mixer'), ': each channel goes to an insert track (the number next to its name). Inserts feed the Master.'))),
    ...sec('4 · Keyboard shortcuts',
      h('table', {}, ...SHORTCUTS.map(([k, d]) => h('tr', {}, h('td', {}, k), h('td', {}, d))))),
    ...sec('5 · Install it anywhere',
      h('div', { class: 'install-grid' },
        card('🌐 Any web browser', 'Open the website. Nothing to install. Works best in Chrome, Edge, Brave, Firefox or Safari 16+.'),
        card('💻 Windows / macOS / Linux / ChromeOS app', 'In Chrome or Edge, click the install icon in the address bar (or ⋮ → "Install PulseForge"). It runs in its own window and works offline.'),
        card('🖥 Native desktop build', 'From the source code: npm install, then npm run desktop to launch, or npm run dist to build a .dmg / .exe / AppImage (Electron).'),
        card('📱 iPhone / iPad', 'Open the site in Safari → Share → "Add to Home Screen". It launches full-screen like a native app. Turn off silent mode to hear sound.'),
        card('🤖 Android', 'Open the site in Chrome → ⋮ → "Install app" (or "Add to Home screen").'),
        card('🏠 Self-host / offline', 'Download the code and run npx serve . (or python3 -m http.server), then open http://localhost:3000. Any static web host works.')),
      h('p', {}, 'Full step-by-step instructions are in the README on GitHub.')),
    ...sec('6 · Tips',
      h('ul', {},
        h('li', {}, 'Scroll the mouse wheel over a lit step to change its velocity. Right-click a step or note to delete it.'),
        h('li', {}, 'Piano roll: 🔒 Lock keeps every note in your chosen scale, and chord stamps place whole chords in one click.'),
        h('li', {}, 'Connect a MIDI keyboard: it works right away in Chrome and Edge. Press ● record while playing to capture notes.'),
        h('li', {}, 'Ctrl/⌘ + K opens the command palette. Type what you want ("reverb", "export", "new pattern").'),
        h('li', {}, 'Export MIDI to continue a pattern in any other DAW.'))),
    h('div', { class: 'actions' },
      firstRun ? h('label', { style: { marginRight: 'auto', display: 'flex', gap: '6px', alignItems: 'center' } }, dontShow = h('input', { type: 'checkbox', checked: true }), "Don't show on startup") : null,
      h('button', { class: 'btn primary', onclick: () => {
        if (dontShow) try { localStorage.setItem('pf.guideSeen', dontShow.checked ? '1' : ''); } catch {}
        app.closeModal();
      } }, firstRun ? "Let's make music →" : 'Close')));
}

function card(title, text) { return h('div', {}, h('b', {}, title), h('p', {}, text)); }

// ---------- Command palette ----------
export class Palette {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('palette');
    this.input = document.getElementById('paletteInput');
    this.list = document.getElementById('paletteList');
    this.idx = 0;
    this.input.addEventListener('input', () => { this.idx = 0; this.render(); });
    this.input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { this.idx++; this.render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { this.idx = Math.max(0, this.idx - 1); this.render(); e.preventDefault(); }
      else if (e.key === 'Enter') { const c = this.matches[this.idx]; if (c) this.run(c); }
      else if (e.key === 'Escape') this.close();
      e.stopPropagation();
    });
    this.root.addEventListener('pointerdown', e => { if (e.target === this.root) this.close(); });
  }
  open() { this.root.hidden = false; this.input.value = ''; this.idx = 0; this.render(); this.input.focus(); }
  close() { this.root.hidden = true; }
  run(c) { this.close(); c.run(); }
  render() {
    const q = this.input.value.toLowerCase().trim();
    const cmds = this.app.commands();
    this.matches = cmds.filter(c => !q || q.split(/\s+/).every(w => (c.name + ' ' + (c.keys || '')).toLowerCase().includes(w))).slice(0, 40);
    this.idx = Math.min(this.idx, Math.max(0, this.matches.length - 1));
    this.list.replaceChildren(...this.matches.map((c, i) => h('li', { class: i === this.idx ? 'sel' : '', onclick: () => this.run(c) }, h('span', {}, c.name), h('small', {}, c.keys || ''))));
  }
}
