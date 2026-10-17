// Project model, defaults, demo song and undo/redo history.

export const uid = () => Math.random().toString(36).slice(2, 10);

export const COLORS = ['#ff5c8a', '#ffb547', '#5cf2a0', '#4cc9ff', '#a78bfa', '#ff7b54', '#f5e663', '#62e0d9'];

export const DRUM_KITS = ['kick', 'snare', 'clap', 'hat', 'openhat', 'tom', 'rim', 'perc'];

export const SYNTH_PRESETS = {
  'Supersaw Lead': { wave: 'sawtooth', voices: 5, detune: 18, cutoff: 6000, res: 2, attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.25, octave: 0 },
  'Deep Bass':     { wave: 'sawtooth', voices: 1, detune: 0, cutoff: 600, res: 6, attack: 0.005, decay: 0.15, sustain: 0.6, release: 0.08, octave: -1 },
  '808 Sub':       { wave: 'sine', voices: 1, detune: 0, cutoff: 12000, res: 0, attack: 0.002, decay: 0.9, sustain: 0.4, release: 0.3, octave: -1, glide808: true, drive: 0.4 },
  'Warm Pad':      { wave: 'triangle', voices: 4, detune: 12, cutoff: 2200, res: 1, attack: 0.4, decay: 0.5, sustain: 0.8, release: 1.2, octave: 0 },
  'Pluck':         { wave: 'square', voices: 2, detune: 6, cutoff: 3500, res: 4, attack: 0.002, decay: 0.18, sustain: 0.0, release: 0.15, octave: 0, filterEnv: 0.8 },
  'Retro Square':  { wave: 'square', voices: 1, detune: 0, cutoff: 9000, res: 0, attack: 0.002, decay: 0.1, sustain: 0.6, release: 0.1, octave: 0 },
  'FM Bell':       { fm: true, ratio: 3.5, index: 6, attack: 0.002, decay: 1.2, sustain: 0.0, release: 1.0, octave: 1, cutoff: 12000, res: 0 },
  'FM E-Piano':    { fm: true, ratio: 1, index: 2.5, attack: 0.003, decay: 0.8, sustain: 0.3, release: 0.4, octave: 0, cutoff: 8000, res: 0 },
};

export const FX_TYPES = {
  eq:         { name: 'Parametric EQ', params: { low: 0, mid: 0, high: 0, midFreq: 1000 } },
  compressor: { name: 'Compressor', params: { threshold: -18, ratio: 4, attack: 0.01, release: 0.2, makeup: 1.4 } },
  reverb:     { name: 'Reverb', params: { size: 2.5, decay: 3, mix: 0.3 } },
  delay:      { name: 'Delay', params: { time: 0.375, feedback: 0.35, mix: 0.25, sync: 1 } },
  distortion: { name: 'Distortion', params: { drive: 0.4, tone: 6000, mix: 1 } },
  filter:     { name: 'Filter', params: { type: 0, cutoff: 2000, res: 1 } },
  chorus:     { name: 'Chorus', params: { rate: 1.2, depth: 0.004, mix: 0.4 } },
  bitcrush:   { name: 'Bitcrusher', params: { bits: 6, mix: 0.6 } },
  stereo:     { name: 'Stereo Widener', params: { width: 0.012 } },
};

export const PARAM_RANGES = {
  low: [-18, 18, 0.5], mid: [-18, 18, 0.5], high: [-18, 18, 0.5], midFreq: [100, 8000, 10],
  threshold: [-60, 0, 1], ratio: [1, 20, 0.5], attack: [0.001, 1, 0.001], release: [0.01, 2, 0.01], makeup: [0, 4, 0.05],
  size: [0.3, 6, 0.1], decay: [0.5, 8, 0.1], mix: [0, 1, 0.01],
  time: [0.02, 1.5, 0.005], feedback: [0, 0.95, 0.01], sync: [0, 1, 1],
  drive: [0, 1, 0.01], tone: [500, 16000, 50],
  type: [0, 2, 1], cutoff: [40, 18000, 10], res: [0, 20, 0.1],
  rate: [0.05, 8, 0.05], depth: [0.0005, 0.01, 0.0005],
  bits: [1, 16, 1], width: [0, 0.03, 0.001],
};

export const SCALES = {
  'Chromatic': [0,1,2,3,4,5,6,7,8,9,10,11],
  'Major': [0,2,4,5,7,9,11],
  'Minor': [0,2,3,5,7,8,10],
  'Harmonic Minor': [0,2,3,5,7,8,11],
  'Dorian': [0,2,3,5,7,9,10],
  'Phrygian': [0,1,3,5,7,8,10],
  'Pentatonic Maj': [0,2,4,7,9],
  'Pentatonic Min': [0,3,5,7,10],
  'Blues': [0,3,5,6,7,10],
};
export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const noteName = p => NOTE_NAMES[p % 12] + (Math.floor(p / 12) - 1);

export function makeChannel(type, name, opts = {}, idx = 0) {
  const ch = {
    id: uid(), name, type, color: COLORS[idx % COLORS.length],
    vol: 0.8, pan: 0, mute: false, solo: false, mixer: opts.mixer ?? 1, root: 60,
    params: {},
  };
  if (type === 'drum') ch.params = { kit: opts.kit || 'kick', tune: 0, decay: 1, tone: 0.5 };
  if (type === 'synth') ch.params = { ...(SYNTH_PRESETS[opts.preset] || SYNTH_PRESETS['Supersaw Lead']), preset: opts.preset || 'Supersaw Lead' };
  if (type === 'sampler') ch.params = { sampleId: opts.sampleId || null, attack: 0.001, release: 0.05, reverse: false, oneShot: true };
  if (opts.root) ch.root = opts.root;
  return ch;
}

export function makePattern(name, steps = 16) {
  return { id: uid(), name, steps, notes: {} };
}

export function makeMixerTrack(i) {
  return { id: uid(), name: i === 0 ? 'Master' : `Insert ${i}`, vol: i === 0 ? 0.7 : 0.8, pan: 0, mute: false, solo: false, fx: [] };
}

export function makeFx(type) {
  return { id: uid(), type, on: true, params: { ...FX_TYPES[type].params } };
}

export function newProject() {
  const mixer = Array.from({ length: 9 }, (_, i) => makeMixerTrack(i));
  mixer[0].fx.push(makeFx('compressor'));
  return {
    version: 1, name: 'Untitled', bpm: 128, swing: 0, mode: 'pattern',
    scale: { root: 0, name: 'Minor', lock: false },
    channels: [], patterns: [makePattern('Pattern 1')], current: 0,
    playlist: { tracks: 12, clips: [] },
    mixer,
  };
}

const n = (s, p, l = 1, v = 0.8) => ({ id: uid(), s, l, p, v });

export function demoProject() {
  const pr = newProject();
  pr.name = 'Neon Drive (demo)';
  pr.bpm = 124;
  pr.swing = 0.1;
  const add = (type, name, opts) => { const c = makeChannel(type, name, opts, pr.channels.length); pr.channels.push(c); return c; };
  const kick = add('drum', 'Kick', { kit: 'kick', mixer: 1 });
  const clap = add('drum', 'Clap', { kit: 'clap', mixer: 2 });
  const hat = add('drum', 'Hat', { kit: 'hat', mixer: 3 });
  const ohat = add('drum', 'Open Hat', { kit: 'openhat', mixer: 3 });
  const bass = add('synth', 'Bass', { preset: 'Deep Bass', mixer: 4 });
  const pad = add('synth', 'Pad', { preset: 'Warm Pad', mixer: 5 });
  const lead = add('synth', 'Lead', { preset: 'Pluck', mixer: 6 });
  pr.mixer[1].name = 'Kick'; pr.mixer[2].name = 'Clap'; pr.mixer[3].name = 'Hats';
  pr.mixer[4].name = 'Bass'; pr.mixer[5].name = 'Pad'; pr.mixer[6].name = 'Lead';
  pr.mixer[5].fx.push(makeFx('reverb'));
  pr.mixer[6].fx.push(makeFx('delay'), makeFx('reverb'));
  pr.mixer[6].fx[1].params.mix = 0.2;
  pr.mixer[4].fx.push(makeFx('distortion'));
  pr.mixer[4].fx[0].params.drive = 0.15;
  hat.vol = 0.45; ohat.vol = 0.4; pad.vol = 0.45; lead.vol = 0.5; bass.vol = 0.7;

  const drums = makePattern('Drums');
  drums.notes[kick.id] = [0, 4, 8, 12].map(s => n(s, 60, 1, 1));
  drums.notes[clap.id] = [4, 12].map(s => n(s, 60, 1, 0.9));
  drums.notes[hat.id] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].filter(s => s % 4 !== 2).map(s => n(s, 60, 1, s % 2 ? 0.5 : 0.8));
  drums.notes[ohat.id] = [2, 6, 10, 14].map(s => n(s, 60, 1, 0.7));

  const music = makePattern('Bass + Chords', 32);
  // A minor progression: Am - F - C - G, two steps per chord = 8 steps each
  const roots = [45, 41, 48, 43];
  const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
  music.notes[bass.id] = [];
  music.notes[pad.id] = [];
  roots.forEach((r, i) => {
    [0, 3, 6].forEach(o => music.notes[bass.id].push(n(i * 8 + o, r, o === 6 ? 2 : 2, 0.9)));
    chords[i].forEach(p => music.notes[pad.id].push(n(i * 8, p, 8, 0.6)));
  });

  const melody = makePattern('Lead Hook', 32);
  const mel = [[0, 69], [2, 72], [4, 76], [6, 74], [8, 72], [10, 69], [12, 72], [14, 74],
               [16, 76], [18, 79], [20, 76], [22, 74], [24, 72], [26, 74], [28, 71], [30, 67]];
  melody.notes[lead.id] = mel.map(([s, p]) => n(s, p, 1.5, 0.8));

  pr.patterns = [drums, music, melody];
  // Arrangement: intro, build, drop
  const clip = (pattern, track, start, len) => pr.playlist.clips.push({ id: uid(), pattern: pattern.id, track, start, len });
  clip(music, 1, 0, 8);
  clip(drums, 0, 2, 6);
  clip(melody, 2, 4, 4);
  pr.playlist.clips.forEach(c => c.len = Math.max(1, c.len));
  return pr;
}

// ---------- History ----------
export class History {
  constructor(limit = 120) { this.undoStack = []; this.redoStack = []; this.limit = limit; }
  push(snapshot) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }
  undo(current) {
    if (!this.undoStack.length) return null;
    this.redoStack.push(current);
    return this.undoStack.pop();
  }
  redo(current) {
    if (!this.redoStack.length) return null;
    this.undoStack.push(current);
    return this.redoStack.pop();
  }
}
