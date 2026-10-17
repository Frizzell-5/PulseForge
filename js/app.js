// PulseForge Studio — application controller.
import { newProject, demoProject, makeChannel, makePattern, uid, History, DRUM_KITS, SYNTH_PRESETS, FX_TYPES, makeFx } from './state.js';
import { Engine, renderOffline, encodeWav, encodeMidi } from './audio/engine.js';
import { SampleBank } from './audio/samples.js';
import { WindowManager, LAYOUTS } from './ui/windows.js';
import { Rack } from './ui/rack.js';
import { PianoRoll } from './ui/pianoroll.js';
import { Playlist } from './ui/playlist.js';
import { Mixer } from './ui/mixer.js';
import { Browser } from './ui/browser.js';
import { openEditor } from './ui/editor.js';
import { guideContent, Palette } from './ui/guide.js';
import { h, css } from './ui/widgets.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'pf.project.v1';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const TYPING_KEYS = 'zsxdcvgbhnjm,l.;/q2w3er5t6y7ui9o0p'; // two-octave piano layout
const KEY_OFFSETS = { z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12, l: 13, '.': 14, ';': 15, '/': 16,
  q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23, i: 24, 9: 25, o: 26, 0: 27, p: 28 };

class App {
  constructor() {
    this.bank = new SampleBank();
    this.history = new History();
    this.project = this.loadSaved() || demoProject();
    this.sel = this.project.channels[0]?.id || null;
    this.octave = 4;
    this.typing = store.get('pf.typing') !== '0';
    this.engine = new Engine(() => this.project, this.bank);

    this.wm = new WindowManager($('workspace'), () => this.drawCanvases());
    this.rack = new Rack(this, $('rack'), $('rackTools'));
    this.pianoroll = new PianoRoll(this, $('pianoroll'), $('prTools'), $('prTitle'));
    this.playlist = new Playlist(this, $('playlist'), $('plTools'));
    this.mixer = new Mixer(this, $('mixer'));
    this.browser = new Browser(this, $('browser'));
    this.palette = new Palette(this);

    this.bindTopbar();
    this.bindKeys();
    this.engine.on(playing => { $('btnPlay').classList.toggle('on', playing); $('btnPlay').textContent = playing ? '❚❚' : '▶'; });
    this.render();
    requestAnimationFrame(() => { this.pianoroll.focusNotes(); this.drawCanvases(); });
    this.loop();
    this.restoreSamples();

    if (!store.get('pf.guideSeen')) this.showGuide(true);
    window.addEventListener('pointerdown', () => this.initMidi(), { once: true });
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.installPrompt = e; });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ---------- state ----------
  get pattern() {
    const p = this.project;
    if (!p.patterns.length) p.patterns.push(makePattern('Pattern 1'));
    p.current = Math.min(Math.max(0, p.current | 0), p.patterns.length - 1);
    return p.patterns[p.current];
  }
  snapshot() { return JSON.stringify(this.project); }
  checkpoint() { this.history.push(this.snapshot()); }
  changed(render = true) {
    this.engine.sync();
    this.scheduleSave();
    if (render) this.render();
  }
  commit(fn, render = true) { this.checkpoint(); fn(); this.changed(render); }
  live(fn) {
    if (!this.liveOpen) { this.checkpoint(); this.liveOpen = true; }
    fn(); this.engine.sync(); this.scheduleSave();
  }
  endLive() { this.liveOpen = false; }
  restore(json) {
    this.project = JSON.parse(json);
    this.engine.rebuild();
    this.changed();
  }
  undo() { const s = this.history.undo(this.snapshot()); if (s) { this.restore(s); this.toast('Undo'); } }
  redo() { const s = this.history.redo(this.snapshot()); if (s) { this.restore(s); this.toast('Redo'); } }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { try { localStorage.setItem(SAVE_KEY, this.snapshot()); } catch (e) { console.warn(e); } }, 500);
  }
  loadSaved() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  }
  async restoreSamples() {
    const ids = this.project.channels.filter(c => c.type === 'sampler').map(c => c.params.sampleId);
    await this.bank.restore(ids);
    this.browser.render();
  }
  setProject(p) {
    this.checkpoint();
    this.engine.stop();
    this.project = p;
    this.sel = p.channels[0]?.id || null;
    this.engine.rebuild();
    this.changed();
    this.pianoroll.focusNotes();
    this.restoreSamples();
  }

  // ---------- rendering ----------
  render() {
    const p = this.project;
    const ps = $('patSelect');
    ps.replaceChildren(...p.patterns.map((pt, i) => h('option', { value: i }, `${i + 1}. ${pt.name}`)), h('option', { value: 'rename' }, '✎ Rename pattern…'), h('option', { value: 'delete' }, '🗑 Delete pattern'));
    ps.value = p.current;
    $('bpm').value = p.bpm;
    $('swing').value = p.swing;
    $('modePat').classList.toggle('on', p.mode !== 'song');
    $('modeSong').classList.toggle('on', p.mode === 'song');
    $('btnMetro').classList.toggle('on', this.engine.metronome);
    document.title = `${p.name} — PulseForge Studio`;
    this.rack.render();
    this.mixer.render();
    this.browser.render();
    this.pianoroll.renderTools();
    this.drawCanvases();
  }
  drawCanvases() {
    if (!this.wm.wins.pianoroll.hidden) this.pianoroll.draw();
    if (!this.wm.wins.playlist.hidden) this.playlist.draw();
  }

  loop() {
    const step = this.engine.position();
    const lcd = $('pos');
    if (step == null) { if (lcd.textContent !== '1:1:1') lcd.textContent = '1:1:1'; }
    else { const s = Math.floor(step); lcd.textContent = `${Math.floor(s / 16) + 1}:${Math.floor((s % 16) / 4) + 1}:${(s % 4) + 1}`; }
    const pat = this.pattern;
    let local = null;
    if (step != null) {
      if (this.project.mode === 'song' && this.project.playlist.clips.length) {
        const clip = this.project.playlist.clips.find(c => c.pattern === pat.id && step >= c.start * 16 && step < (c.start + c.len) * 16);
        local = clip ? (step - clip.start * 16) % pat.steps : null;
      } else local = step % pat.steps;
    }
    this.rack.highlight(local);
    if (!this.wm.wins.pianoroll.hidden) this.pianoroll.setPlayhead(local);
    if (!this.wm.wins.playlist.hidden) this.playlist.setPlayhead(step);
    this.drawScope();
    if (!this.wm.wins.mixer.hidden) this.mixer.tick();
    requestAnimationFrame(() => this.loop());
  }

  drawScope() {
    const cv = $('scope'), an = this.engine.analyser(0);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    if (!an) return;
    const buf = this.scopeBuf || (this.scopeBuf = new Float32Array(an.fftSize));
    an.getFloatTimeDomainData(buf);
    g.strokeStyle = css('--ok'); g.lineWidth = 1.5; g.beginPath();
    for (let i = 0; i < cv.width; i++) {
      const v = buf[Math.floor(i / cv.width * buf.length)];
      const y = cv.height / 2 - v * cv.height / 2;
      i ? g.lineTo(i, y) : g.moveTo(i, y);
    }
    g.stroke();
  }

  // ---------- actions ----------
  select(id) { this.sel = id; this.rack.render(); this.pianoroll.sel.clear(); this.pianoroll.focusNotes(); this.pianoroll.draw(); }
  selectPattern(i, render = true) {
    if (i < 0 || i >= this.project.patterns.length) return;
    this.project.current = i;
    this.pianoroll.sel.clear();
    if (render) this.render(); else { $('patSelect').value = i; this.rack.render(); this.pianoroll.draw(); }
    this.scheduleSave();
  }
  setMode(m) { this.project.mode = m; this.render(); this.scheduleSave(); }

  addChannel(type, opt) {
    const pr = this.project;
    const name = type === 'drum' ? opt[0].toUpperCase() + opt.slice(1) : type === 'synth' ? opt : (this.bank.get(opt)?.name || 'Sample').replace(/\.[^.]+$/, '');
    const used = new Set(pr.channels.map(c => c.mixer));
    const free = pr.mixer.findIndex((m, i) => i > 0 && !used.has(i));
    const ch = makeChannel(type, name, { kit: opt, preset: opt, sampleId: opt, mixer: free > 0 ? free : 1 }, pr.channels.length);
    this.commit(() => { pr.channels.push(ch); if (free > 0) pr.mixer[free].name = name; });
    this.select(ch.id);
    this.engine.preview(ch, ch.root);
    this.toast(`Added ${name}`);
    return ch;
  }
  addChannelMenu(e) {
    this.contextMenu(e, [
      ...DRUM_KITS.map(k => [`Drum: ${k}`, () => this.addChannel('drum', k)]), '-',
      ...Object.keys(SYNTH_PRESETS).map(p => [`Synth: ${p}`, () => this.addChannel('synth', p)]), '-',
      ['Sampler: import audio…', () => this.importSample()],
      ['Sampler: record microphone…', () => this.recordMic()],
    ]);
  }
  newPattern() {
    const pr = this.project;
    this.commit(() => { pr.patterns.push(makePattern(`Pattern ${pr.patterns.length + 1}`)); pr.current = pr.patterns.length - 1; });
  }
  clonePattern() {
    const pr = this.project, src = this.pattern;
    this.commit(() => {
      const c = JSON.parse(JSON.stringify(src)); c.id = uid(); c.name = src.name + ' copy';
      Object.values(c.notes).forEach(ns => ns.forEach(n => n.id = uid()));
      pr.patterns.splice(pr.current + 1, 0, c); pr.current++;
    });
  }
  deletePattern() {
    const pr = this.project;
    if (pr.patterns.length < 2) return this.toast('A project needs at least one pattern');
    const pat = this.pattern;
    if (!confirm(`Delete "${pat.name}" and its playlist clips?`)) return this.render();
    this.commit(() => {
      pr.patterns.splice(pr.current, 1);
      pr.playlist.clips = pr.playlist.clips.filter(c => c.pattern !== pat.id);
      pr.current = Math.max(0, pr.current - 1);
    });
  }

  generateBeat() {
    const pr = this.project, pat = this.pattern, S = pat.steps;
    const drums = pr.channels.filter(c => c.type === 'drum');
    if (!drums.length) return this.toast('Add some drum channels first');
    const rnd = p => Math.random() < p;
    const styles = ['house', 'trap', 'breakbeat', 'techno'];
    const style = styles[Math.floor(Math.random() * styles.length)];
    this.commit(() => drums.forEach(ch => {
      const steps = [];
      for (let i = 0; i < S; i++) {
        const b = i % 16; let on = false, v = 0.8;
        switch (ch.params.kit) {
          case 'kick': on = style === 'house' || style === 'techno' ? b % 4 === 0 : style === 'trap' ? (b === 0 || (b === 10 && rnd(0.7)) || rnd(0.08)) : (b === 0 || b === 10 || (b === 7 && rnd(0.5))); break;
          case 'snare': case 'clap': on = style === 'trap' ? b === 8 : b === 4 || b === 12 || (b === 15 && rnd(0.25)); break;
          case 'hat': on = style === 'trap' ? (rnd(0.85) || b % 2 === 0) : style === 'techno' ? true : b % 2 === 0 || rnd(0.3); v = b % 4 === 0 ? 0.8 : 0.5; break;
          case 'openhat': on = (style === 'house' || style === 'techno') ? b % 4 === 2 : rnd(0.1); break;
          default: on = rnd(0.18);
        }
        if (on) steps.push({ id: uid(), s: i, l: 1, p: ch.root, v });
      }
      pat.notes[ch.id] = steps;
    }));
    this.toast(`✨ Fresh ${style} groove — Ctrl+Z to undo`);
  }

  // ---------- files ----------
  download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  safeName() { return (this.project.name || 'project').replace(/[^\w\- ]+/g, '').trim() || 'project'; }
  saveFile() {
    const ids = this.project.channels.filter(c => c.type === 'sampler').map(c => c.params.sampleId);
    const data = { app: 'PulseForge', project: this.project, samples: this.bank.serialize(ids) };
    this.download(new Blob([JSON.stringify(data)], { type: 'application/json' }), this.safeName() + '.pfproj');
    this.toast('Project saved to your downloads');
  }
  openFile() { $('fileOpen').click(); }
  async loadFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const project = data.project || data;
      if (!project.channels || !project.patterns) throw new Error('Not a PulseForge project');
      await this.bank.deserialize(data.samples);
      this.setProject(project);
      this.toast(`Opened ${file.name}`);
    } catch (e) { alert('Could not open this file: ' + e.message); }
  }
  newProject() {
    if (!confirm('Start a new empty project? (Your current one can be restored with Undo.)')) return;
    const p = newProject();
    ['kick', 'snare', 'hat'].forEach((k, i) => { p.channels.push(makeChannel('drum', k[0].toUpperCase() + k.slice(1), { kit: k, mixer: i + 1 }, i)); p.mixer[i + 1].name = k; });
    p.channels.push(makeChannel('synth', 'Synth', { preset: 'Supersaw Lead', mixer: 4 }, 3)); p.mixer[4].name = 'Synth';
    this.setProject(p);
  }
  loadDemo() { this.setProject(demoProject()); this.toast('Demo loaded. Press Space to play'); }
  renameProject() { const n = prompt('Project name', this.project.name); if (n) this.commit(() => this.project.name = n); }

  async exportWav() {
    const songMode = this.project.mode === 'song' && this.project.playlist.clips.length;
    this.toast(songMode ? 'Rendering song…' : 'Rendering pattern (2 loops). Switch to SONG mode to export the arrangement…', 6000);
    try {
      const buf = await renderOffline(this.project, this.bank, { loops: 2 });
      this.download(encodeWav(buf), this.safeName() + '.wav');
      this.toast(`Exported ${buf.duration.toFixed(1)}s WAV`);
    } catch (e) { console.error(e); alert('Export failed: ' + e.message); }
  }
  exportMidi() { this.download(encodeMidi(this.project, this.pattern), `${this.safeName()} - ${this.pattern.name}.mid`); this.toast('MIDI exported'); }

  importSample(targetCh) {
    const inp = $('fileSample');
    inp.onchange = async () => {
      for (const f of inp.files) {
        try {
          const entry = await this.bank.add(f.name, await f.arrayBuffer());
          if (targetCh && targetCh.type === 'sampler') this.commit(() => targetCh.params.sampleId = entry.id);
          else this.addChannel('sampler', entry.id);
        } catch { this.toast(`Could not decode ${f.name}`); }
      }
      inp.value = '';
      this.browser.render();
    };
    inp.click();
  }

  async recordMic() {
    if (!navigator.mediaDevices?.getUserMedia) return alert('Microphone recording is not supported in this browser.');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } }); }
    catch { return alert('Microphone permission was denied.'); }
    const rec = new MediaRecorder(stream), chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      try {
        const blob = new Blob(chunks, { type: rec.mimeType });
        const entry = await this.bank.add(`Recording ${new Date().toLocaleTimeString()}`, await blob.arrayBuffer());
        this.addChannel('sampler', entry.id);
      } catch { this.toast('Recording could not be decoded'); }
    };
    rec.start();
    const t0 = Date.now();
    const timer = h('b', {}, '0.0s');
    const iv = setInterval(() => timer.textContent = ((Date.now() - t0) / 1000).toFixed(1) + 's', 100);
    this.showModal(h('div', { style: { textAlign: 'center' } },
      h('h1', {}, '● Recording'), h('p', { class: 'lead' }, 'Recording from your microphone… ', timer),
      h('button', { class: 'btn primary', onclick: () => { clearInterval(iv); rec.stop(); this.closeModal(); } }, 'Stop & add to rack')));
  }

  // ---------- MIDI + typing keyboard ----------
  async initMidi() {
    if (!navigator.requestMIDIAccess) return;
    try {
      const access = await navigator.requestMIDIAccess();
      const hook = () => access.inputs.forEach(inp => inp.onmidimessage = m => this.midi(m.data));
      hook(); access.onstatechange = hook;
    } catch {}
  }
  midi([st, d1, d2]) {
    const ch = this.project.channels.find(c => c.id === this.sel); if (!ch) return;
    const cmd = st & 0xf0;
    if (cmd === 0x90 && d2 > 0) this.liveOn(ch, d1, d2 / 127);
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) this.liveOff(ch, d1);
  }
  liveOn(ch, pitch, vel) {
    this.engine.noteOn(ch, pitch, vel);
    if (this.recording && this.engine.playing) {
      const pos = this.engine.position();
      if (pos == null) return;
      const pat = this.pattern;
      const s = Math.round((pos % pat.steps) * 4) / 4 % pat.steps;
      const note = { id: uid(), s, l: 1, p: ch.type === 'drum' ? ch.root : pitch, v: vel };
      (this.recHeld || (this.recHeld = new Map())).set(ch.id + pitch, { note, start: pos });
      if (!this.recDirty) { this.checkpoint(); this.recDirty = true; }
      (pat.notes[ch.id] || (pat.notes[ch.id] = [])).push(note);
      this.rack.render(); this.pianoroll.draw();
    }
  }
  liveOff(ch, pitch) {
    this.engine.noteOff(ch, pitch);
    const held = this.recHeld && this.recHeld.get(ch.id + pitch);
    if (held) {
      const pos = this.engine.position();
      if (pos != null && ch.type !== 'drum') held.note.l = Math.max(0.25, Math.round((pos - held.start) * 4) / 4);
      this.recHeld.delete(ch.id + pitch);
      this.changed(false); this.pianoroll.draw();
    }
  }

  bindKeys() {
    const down = new Set();
    window.addEventListener('keydown', e => {
      if (e.target.closest('input, select, textarea') && !(e.target.type === 'range' || e.target.type === 'checkbox')) return;
      if (!$('modal').hidden) { if (e.key === 'Escape') this.closeModal(); return; }
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      const act = fn => { e.preventDefault(); fn(); };
      if (mod && k === 'z') return act(() => e.shiftKey ? this.redo() : this.undo());
      if (mod && k === 'y') return act(() => this.redo());
      if (mod && k === 's') return act(() => this.saveFile());
      if (mod && k === 'o') return act(() => this.openFile());
      if (mod && k === 'e') return act(() => this.exportWav());
      if (mod && k === 'k') return act(() => this.palette.open());
      if (e.key === 'F1') return act(() => this.showGuide());
      const fkeys = { F5: 'playlist', F6: 'rack', F7: 'pianoroll', F8: 'browser', F9: 'mixer' };
      if (fkeys[e.key]) return act(() => this.wm.toggle(fkeys[e.key]));
      if (e.code === 'Space') return act(() => this.engine.toggle());
      const focused = document.querySelector('.win.focused')?.dataset.panel;
      if (focused === 'pianoroll' && this.pianoroll.handleKey(e)) return e.preventDefault();
      if (mod || e.altKey) return;
      if (e.key === '[') return act(() => this.selectPattern(this.project.current - 1));
      if (e.key === ']') return act(() => this.selectPattern(this.project.current + 1));
      if (k === 'l' && (e.shiftKey || !this.typing)) return act(() => this.setMode(this.project.mode === 'song' ? 'pattern' : 'song'));
      if (k === 'r' && (e.shiftKey || !this.typing)) return act(() => this.toggleRec());
      if (k === 'm' && (e.shiftKey || !this.typing)) return act(() => this.toggleMetro());
      if (this.typing && k in KEY_OFFSETS) {
        e.preventDefault();
        if (e.repeat || down.has(k)) return;
        const ch = this.project.channels.find(c => c.id === this.sel); if (!ch) return;
        down.add(k);
        this.liveOn(ch, this.octave * 12 + KEY_OFFSETS[k], 0.8);
        return;
      }
      if (e.key === 'Escape') this.closeMenu();
    });
    window.addEventListener('keyup', e => {
      const k = e.key.toLowerCase();
      if (!down.has(k)) return;
      down.delete(k);
      const ch = this.project.channels.find(c => c.id === this.sel);
      if (ch) this.liveOff(ch, this.octave * 12 + KEY_OFFSETS[k]);
    });
    window.addEventListener('blur', () => down.clear());
  }

  toggleRec() {
    this.recording = !this.recording;
    this.recDirty = false;
    $('btnRec').classList.toggle('on', this.recording);
    this.toast(this.recording ? 'Record armed: play notes while the pattern plays' : 'Recording off');
    if (this.recording && !this.engine.playing) this.engine.play();
  }
  toggleMetro() { this.engine.metronome = !this.engine.metronome; $('btnMetro').classList.toggle('on', this.engine.metronome); }

  // ---------- top bar ----------
  bindTopbar() {
    $('btnPlay').onclick = () => this.engine.toggle();
    $('btnStop').onclick = () => this.engine.stop();
    $('btnRec').onclick = () => this.toggleRec();
    $('btnMetro').onclick = () => this.toggleMetro();
    $('modePat').onclick = () => this.setMode('pattern');
    $('modeSong').onclick = () => this.setMode('song');
    $('bpm').onchange = e => { const v = Math.max(40, Math.min(300, +e.target.value || 120)); this.commit(() => this.project.bpm = v, false); this.project.mixer.forEach((_, i) => this.engine.updateFx(i)); e.target.value = v; };
    $('swing').oninput = e => this.live(() => this.project.swing = +e.target.value);
    $('swing').onchange = () => this.endLive();
    $('patSelect').onchange = e => {
      const v = e.target.value;
      if (v === 'rename') { const n = prompt('Pattern name', this.pattern.name); if (n) this.commit(() => this.pattern.name = n); else this.render(); }
      else if (v === 'delete') this.deletePattern();
      else this.selectPattern(+v);
    };
    $('patPrev').onclick = () => this.selectPattern(this.project.current - 1);
    $('patNext').onclick = () => this.selectPattern(this.project.current + 1);
    $('patAdd').onclick = () => this.newPattern();
    $('btnGuide').onclick = () => this.showGuide();
    $('btnPalette').onclick = () => this.palette.open();
    $('btnTheme').onclick = () => this.toggleTheme();
    $('fileOpen').onchange = e => { if (e.target.files[0]) this.loadFile(e.target.files[0]); e.target.value = ''; };
    document.querySelectorAll('[data-menu]').forEach(b => b.onclick = e => this.openMenu(b.dataset.menu, b));
    document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => this.wm.setTab(b.dataset.tab));
    document.addEventListener('pointerdown', e => { if (!e.target.closest('#menuPop, [data-menu]')) this.closeMenu(); });
    const theme = store.get('pf.theme');
    if (theme) document.documentElement.dataset.theme = theme;
    // drag & drop audio files or projects anywhere
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', async e => {
      e.preventDefault();
      for (const f of e.dataTransfer.files) {
        if (/\.(pfproj|json)$/i.test(f.name)) { this.loadFile(f); continue; }
        try { const entry = await this.bank.add(f.name, await f.arrayBuffer()); this.addChannel('sampler', entry.id); }
        catch { this.toast(`Could not decode ${f.name}`); }
      }
    });
  }

  toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('pf.theme', next); } catch {}
    this.render();
  }

  menuItems(name) {
    if (name === 'file') return [
      ['New project', () => this.newProject()],
      ['Load demo song', () => this.loadDemo()],
      ['Rename project…', () => this.renameProject()],
      '-',
      ['Open project…', () => this.openFile(), 'Ctrl+O'],
      ['Save project file', () => this.saveFile(), 'Ctrl+S'],
      '-',
      ['Export WAV', () => this.exportWav(), 'Ctrl+E'],
      ['Export pattern as MIDI', () => this.exportMidi()],
      ['Import audio sample…', () => this.importSample()],
      ['Record microphone…', () => this.recordMic()],
      ...(this.installPrompt ? ['-', ['⬇ Install as app', async () => { this.installPrompt.prompt(); this.installPrompt = null; }]] : []),
    ];
    if (name === 'view') return [
      ['Playlist', () => this.wm.toggle('playlist'), 'F5'],
      ['Channel Rack', () => this.wm.toggle('rack'), 'F6'],
      ['Piano Roll', () => this.wm.toggle('pianoroll'), 'F7'],
      ['Browser', () => this.wm.toggle('browser'), 'F8'],
      ['Mixer', () => this.wm.toggle('mixer'), 'F9'],
      '-',
      ...Object.entries(LAYOUTS).map(([k, l]) => [`Layout: ${l.label}`, () => this.wm.apply(k)]),
      '-',
      ['Toggle light / dark theme', () => this.toggleTheme()],
    ];
    return [
      ['Command palette', () => this.palette.open(), 'Ctrl+K'],
      ['Undo', () => this.undo(), 'Ctrl+Z'],
      ['Redo', () => this.redo(), 'Ctrl+Shift+Z'],
      '-',
      ['✨ Generate drum groove', () => this.generateBeat()],
      ['✨ Generate melody (selected channel)', () => this.pianoroll.generate()],
      ['✨ Generate chords (selected channel)', () => this.pianoroll.generateChords()],
      '-',
      [`${this.typing ? '✓' : '  '} Typing keyboard as piano`, () => { this.typing = !this.typing; store.set('pf.typing', this.typing ? '1' : '0'); this.toast(this.typing ? 'Typing keyboard on: letters play notes' : 'Typing keyboard off: L / R / M are shortcuts'); }],
      [`Keyboard octave: ${this.octave} (−)`, () => { this.octave = Math.max(1, this.octave - 1); }],
      [`Keyboard octave: ${this.octave} (+)`, () => { this.octave = Math.min(7, this.octave + 1); }],
      [`${this.engine.metronome ? '✓' : '  '} Metronome`, () => this.toggleMetro()],
      '-',
      ['User guide', () => this.showGuide(), 'F1'],
    ];
  }
  openMenu(name, btn) {
    const r = btn.getBoundingClientRect();
    this.contextMenu({ clientX: r.left, clientY: r.bottom + 4 }, this.menuItems(name));
  }
  contextMenu(e, items) {
    const pop = $('menuPop');
    pop.replaceChildren(...items.map(it => it === '-' ? h('hr') : h('button', { onclick: () => { this.closeMenu(); it[1](); } }, h('span', {}, it[0]), it[2] ? h('kbd', {}, it[2]) : null)));
    pop.hidden = false;
    const w = pop.offsetWidth, hh = pop.offsetHeight;
    pop.style.left = Math.max(4, Math.min(e.clientX, innerWidth - w - 4)) + 'px';
    pop.style.top = Math.max(4, Math.min(e.clientY, innerHeight - hh - 4)) + 'px';
    pop.style.maxHeight = (innerHeight - 8) + 'px'; pop.style.overflowY = 'auto';
  }
  closeMenu() { $('menuPop').hidden = true; }

  commands() {
    const flat = [];
    ['file', 'view', 'tools'].forEach(m => this.menuItems(m).forEach(it => it !== '-' && flat.push({ name: it[0].trim(), run: it[1], keys: it[2] })));
    DRUM_KITS.forEach(k => flat.push({ name: `Add drum: ${k}`, run: () => this.addChannel('drum', k) }));
    Object.keys(SYNTH_PRESETS).forEach(p => flat.push({ name: `Add synth: ${p}`, run: () => this.addChannel('synth', p) }));
    Object.entries(FX_TYPES).forEach(([k, v]) => flat.push({ name: `Add effect to selected mixer track: ${v.name}`, run: () => {
      const i = this.mixer.selected; this.commit(() => this.project.mixer[i].fx.push(makeFx(k))); this.engine.rebuildFx(i); this.wm.show('mixer');
    } }));
    flat.push({ name: 'New pattern', run: () => this.newPattern() }, { name: 'Clone pattern', run: () => this.clonePattern() },
      { name: 'Song mode', run: () => this.setMode('song'), keys: 'L' }, { name: 'Pattern mode', run: () => this.setMode('pattern'), keys: 'L' },
      { name: 'Play / stop', run: () => this.engine.toggle(), keys: 'Space' }, { name: 'Toggle record', run: () => this.toggleRec(), keys: 'R' },
      { name: 'Quantize notes', run: () => this.pianoroll.quantize() });
    this.project.patterns.forEach((p, i) => flat.push({ name: `Go to pattern: ${p.name}`, run: () => this.selectPattern(i) }));
    this.project.channels.forEach(c => flat.push({ name: `Edit instrument: ${c.name}`, run: () => this.openEditor(c) }));
    return flat;
  }

  // ---------- modal & toast ----------
  showModal(content) { const m = $('modal'); m.firstElementChild.replaceChildren(content); m.hidden = false; m.onpointerdown = e => { if (e.target === m) this.closeModal(); }; }
  closeModal() { $('modal').hidden = true; this.render(); }
  showGuide(first = false) { this.showModal(guideContent(this, first)); }
  openEditor(ch) { this.select(ch.id); openEditor(this, ch); }
  toast(msg, ms = 2200) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
}

window.pulseforge = new App();
