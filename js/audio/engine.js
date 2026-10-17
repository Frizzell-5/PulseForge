// Audio graph, transport/scheduler, live playing and offline rendering.
import { trigger } from './instruments.js';
import { createFx } from './effects.js';

const LOOKAHEAD = 0.12;      // seconds scheduled ahead
const TICK = 25;             // ms between scheduler runs

let clipCurve;
function softClipCurve() {
  if (clipCurve) return clipCurve;
  const n = 4096, k = 0.7; clipCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    clipCurve[i] = a < k ? x : Math.sign(x) * (k + (1 - k) * Math.tanh((a - k) / (1 - k)));
  }
  return clipCurve;
}

// ---------- Mixer / channel graph (works on realtime and offline contexts) ----------
export class Graph {
  constructor(ctx, project) {
    this.ctx = ctx;
    this.tracks = [];
    this.strips = new Map();
    const master = this.makeTrack(true);
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.08;
    // Safety soft-clipper after the limiter so the output can never exceed full scale
    this.clip = ctx.createWaveShaper();
    this.clip.curve = softClipCurve();
    master.vol.disconnect(); master.vol.connect(this.limiter).connect(this.clip).connect(master.analyser);
    master.analyser.connect(ctx.destination);
    this.tracks.push(master);
    for (let i = 1; i < project.mixer.length; i++) {
      const t = this.makeTrack(false);
      t.analyser.connect(master.input);
      this.tracks.push(t);
    }
    project.mixer.forEach((_, i) => this.rebuildFx(project, i));
    this.sync(project);
  }

  makeTrack() {
    const ctx = this.ctx;
    const t = { input: ctx.createGain(), pan: ctx.createStereoPanner(), vol: ctx.createGain(), analyser: ctx.createAnalyser(), fx: [] };
    t.analyser.fftSize = 2048; t.analyser.smoothingTimeConstant = 0.8;
    t.input.connect(t.pan).connect(t.vol).connect(t.analyser);
    return t;
  }

  rebuildFx(project, i) {
    const t = this.tracks[i], cfg = project.mixer[i];
    if (!t || !cfg) return;
    t.input.disconnect();
    t.fx.forEach(u => { try { u.output.disconnect(); u.dispose && u.dispose(); } catch {} });
    t.fx = cfg.fx.filter(f => f.on).map(f => { const u = createFx(this.ctx, f, project.bpm); u.cfg = f; return u; });
    let node = t.input;
    t.fx.forEach(u => { node.connect(u.input); node = u.output; });
    node.connect(t.pan);
  }

  updateFxParams(project, i) {
    const t = this.tracks[i];
    if (t) t.fx.forEach(u => u.set(u.cfg.params, project.bpm));
  }

  strip(ch) {
    let s = this.strips.get(ch.id);
    if (!s) {
      s = { input: this.ctx.createGain(), pan: this.ctx.createStereoPanner(), dest: -1 };
      s.input.connect(s.pan);
      this.strips.set(ch.id, s);
    }
    return s;
  }

  sync(project) {
    const anyChSolo = project.channels.some(c => c.solo);
    const ids = new Set();
    project.channels.forEach(ch => {
      ids.add(ch.id);
      const s = this.strip(ch);
      const audible = !ch.mute && (!anyChSolo || ch.solo);
      s.input.gain.value = audible ? ch.vol : 0;
      s.pan.pan.value = ch.pan;
      const dest = Math.min(Math.max(ch.mixer | 0, 0), this.tracks.length - 1);
      if (s.dest !== dest) { s.pan.disconnect(); s.pan.connect(this.tracks[dest].input); s.dest = dest; }
    });
    for (const [id, s] of this.strips) if (!ids.has(id)) { s.pan.disconnect(); this.strips.delete(id); }
    const anyTrSolo = project.mixer.some((m, i) => i > 0 && m.solo);
    project.mixer.forEach((m, i) => {
      const t = this.tracks[i];
      const audible = !m.mute && (i === 0 || !anyTrSolo || m.solo);
      t.vol.gain.value = audible ? m.vol : 0;
      t.pan.pan.value = m.pan;
    });
  }

  audible(project, ch) {
    const anyChSolo = project.channels.some(c => c.solo);
    return !ch.mute && (!anyChSolo || ch.solo);
  }
}

// ---------- Sequencing helpers shared by realtime + offline ----------
export function songLengthSteps(project) {
  return project.playlist.clips.reduce((m, c) => Math.max(m, (c.start + c.len) * 16), 0);
}

function activeSlices(project, step) {
  // returns [[pattern, localStep], ...] sounding at a global step
  if (project.mode === 'song' && project.playlist.clips.length) {
    const out = [];
    const muted = project.playlist.muted || [];
    for (const c of project.playlist.clips) {
      if (muted[c.track]) continue;
      const a = c.start * 16, b = (c.start + c.len) * 16;
      if (step >= a && step < b) {
        const pat = project.patterns.find(p => p.id === c.pattern);
        if (pat) out.push([pat, (step - a) % pat.steps]);
      }
    }
    return out;
  }
  const pat = project.patterns[project.current] || project.patterns[0];
  return pat ? [[pat, step % pat.steps]] : [];
}

export function loopLength(project) {
  if (project.mode === 'song' && project.playlist.clips.length) return songLengthSteps(project);
  const pat = project.patterns[project.current] || project.patterns[0];
  return pat ? pat.steps : 16;
}

function scheduleStep(ctx, graph, project, bank, step, time, stepDur) {
  const swingOffset = (step % 2 === 1) ? project.swing * stepDur * 0.5 : 0;
  for (const [pat, local] of activeSlices(project, step)) {
    for (const chId in pat.notes) {
      const ch = project.channels.find(c => c.id === chId);
      if (!ch || !graph.audible(project, ch)) continue;
      const strip = graph.strip(ch);
      for (const n of pat.notes[chId]) {
        if (Math.floor(n.s) !== local) continue;
        const t = time + (n.s - local) * stepDur + swingOffset;
        const v = trigger(ctx, strip.input, ch, Math.max(t, ctx.currentTime), n.p, n.v, bank);
        v.release(t + n.l * stepDur);
      }
    }
  }
}

// ---------- Realtime engine ----------
export class Engine {
  constructor(getProject, bank) {
    this.getProject = getProject;
    this.bank = bank;
    this.ctx = null;
    this.graph = null;
    this.playing = false;
    this.metronome = false;
    this.live = new Map();
    this.queue = [];
    this.listeners = new Set();
  }

  async ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.graph = new Graph(this.ctx, this.getProject());
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx;
  }

  rebuild() { // after loading a new project
    if (!this.ctx) return;
    this.graph.tracks.forEach(t => { try { t.analyser.disconnect(); } catch {} });
    this.graph = new Graph(this.ctx, this.getProject());
  }

  sync() { if (this.graph) this.graph.sync(this.getProject()); }
  rebuildFx(i) { if (this.graph) this.graph.rebuildFx(this.getProject(), i); }
  updateFx(i) { if (this.graph) this.graph.updateFxParams(this.getProject(), i); }

  stepDur() { return 60 / this.getProject().bpm / 4; }

  async play(fromStep = 0) {
    await this.ensure();
    this.stop();
    this.playing = true;
    this.step = fromStep;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.queue = [];
    this.timer = setInterval(() => this.tick(), TICK);
    this.tick();
    this.emit();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const was = this.playing;
    this.playing = false;
    this.queue = [];
    if (was) this.emit();
  }

  toggle() { return this.playing ? (this.stop(), false) : (this.play(), true); }

  tick() {
    const project = this.getProject();
    const dur = this.stepDur();
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const len = loopLength(project);
      if (this.step >= len) this.step = 0;
      scheduleStep(this.ctx, this.graph, project, this.bank, this.step, this.nextTime, dur);
      if (this.metronome && this.step % 4 === 0) this.click(this.nextTime, this.step % 16 === 0);
      this.queue.push({ step: this.step, time: this.nextTime });
      this.nextTime += dur;
      this.step++;
    }
  }

  click(t, accent) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = accent ? 1800 : 1200;
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + 0.06);
  }

  // Fractional playhead step (null when stopped)
  position() {
    if (!this.playing || !this.ctx) return null;
    const now = this.ctx.currentTime;
    while (this.queue.length > 1 && this.queue[1].time <= now) this.queue.shift();
    const q = this.queue[0];
    if (!q || q.time > now) return q ? q.step : null;
    return q.step + Math.min((now - q.time) / this.stepDur(), 1);
  }

  // Live (keyboard / MIDI / clicks)
  async noteOn(ch, pitch, vel = 0.8) {
    await this.ensure();
    const key = ch.id + ':' + pitch;
    this.noteOff(ch, pitch);
    const v = trigger(this.ctx, this.graph.strip(ch).input, ch, this.ctx.currentTime, pitch, vel, this.bank);
    this.live.set(key, v);
  }
  noteOff(ch, pitch) {
    const key = ch.id + ':' + pitch, v = this.live.get(key);
    if (v && this.ctx) { v.release(this.ctx.currentTime); this.live.delete(key); }
  }
  async preview(ch, pitch = 60, dur = 0.3, vel = 0.8) {
    await this.ensure();
    const t = this.ctx.currentTime;
    trigger(this.ctx, this.graph.strip(ch).input, ch, t, pitch, vel, this.bank).release(t + dur);
  }

  analyser(i = 0) { return this.graph ? this.graph.tracks[i]?.analyser : null; }

  on(fn) { this.listeners.add(fn); }
  emit() { this.listeners.forEach(f => f(this.playing)); }
}

// ---------- Offline render ----------
export async function renderOffline(project, bank, { loops = 2, tail = 2.5, sampleRate = 44100 } = {}) {
  const stepDur = 60 / project.bpm / 4;
  const songSteps = loopLength(project) * (project.mode === 'song' && project.playlist.clips.length ? 1 : loops);
  const length = Math.ceil((songSteps * stepDur + tail) * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const graph = new Graph(ctx, project);
  for (let s = 0; s < songSteps; s++) scheduleStep(ctx, graph, project, bank, s, s * stepDur, stepDur);
  return ctx.startRendering();
}

export function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, len * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, data[c][i]));
    out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Blob([out], { type: 'audio/wav' });
}

// ---------- MIDI file export (type 1) ----------
export function encodeMidi(project, pattern) {
  const ppq = 96, perStep = ppq / 4;
  const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
  const str = s => [...s].map(c => c.charCodeAt(0));
  const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (id, bytes) => [...str(id), ...u32(bytes.length), ...bytes];
  const tempo = Math.round(60000000 / project.bpm);
  const tracks = [chunk('MTrk', [0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0, 0xff, 0x2f, 0])];
  project.channels.forEach((ch, i) => {
    const notes = pattern.notes[ch.id];
    if (!notes || !notes.length) return;
    const mc = ch.type === 'drum' ? 9 : i % 9;
    const ev = [];
    notes.forEach(n => {
      const p = Math.max(0, Math.min(127, n.p)), v = Math.max(1, Math.round(n.v * 127));
      ev.push({ t: Math.round(n.s * perStep), d: [0x90 | mc, p, v] });
      ev.push({ t: Math.round((n.s + n.l) * perStep), d: [0x80 | mc, p, 0] });
    });
    ev.sort((a, b) => a.t - b.t || (a.d[0] & 0xf0) - (b.d[0] & 0xf0));
    const bytes = [0, 0xff, 0x03, ...vlq(ch.name.length), ...str(ch.name)];
    let last = 0;
    ev.forEach(e => { bytes.push(...vlq(e.t - last), ...e.d); last = e.t; });
    bytes.push(0, 0xff, 0x2f, 0);
    tracks.push(chunk('MTrk', bytes));
  });
  const header = chunk('MThd', [0, 1, 0, tracks.length, 0, ppq]);
  return new Blob([new Uint8Array([...header, ...tracks.flat()])], { type: 'audio/midi' });
}
