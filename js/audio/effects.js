// Insert effects. Each factory returns { input, output, set(params, bpm), dispose() }.
import { driveCurve } from './instruments.js';

function wetDry(ctx) {
  const input = ctx.createGain(), output = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  return { input, output, dry, wet, mix(m) { dry.gain.value = Math.cos(m * Math.PI / 2); wet.gain.value = Math.sin(m * Math.PI / 2); } };
}

function impulse(ctx, size, decay) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * size));
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

const crushCache = new Map();
function crushCurve(bits) {
  if (crushCache.has(bits)) return crushCache.get(bits);
  const n = 4096, c = new Float32Array(n), steps = Math.pow(2, bits);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.round(x * steps) / steps; }
  crushCache.set(bits, c);
  return c;
}

const FACTORIES = {
  eq(ctx) {
    const lo = ctx.createBiquadFilter(), mid = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter();
    lo.type = 'lowshelf'; lo.frequency.value = 200;
    mid.type = 'peaking'; mid.Q.value = 0.9;
    hi.type = 'highshelf'; hi.frequency.value = 5000;
    lo.connect(mid).connect(hi);
    return { input: lo, output: hi, set(p) { lo.gain.value = p.low; mid.gain.value = p.mid; mid.frequency.value = p.midFreq; hi.gain.value = p.high; } };
  },
  compressor(ctx) {
    const c = ctx.createDynamicsCompressor(), g = ctx.createGain();
    c.connect(g);
    return { input: c, output: g, set(p) {
      c.threshold.value = p.threshold; c.ratio.value = p.ratio; c.attack.value = p.attack; c.release.value = p.release; c.knee.value = 6;
      g.gain.value = p.makeup;
    } };
  },
  reverb(ctx) {
    const w = wetDry(ctx), conv = ctx.createConvolver(), pre = ctx.createBiquadFilter();
    pre.type = 'highpass'; pre.frequency.value = 180;
    w.input.connect(pre).connect(conv).connect(w.wet);
    let key = '';
    return { input: w.input, output: w.output, set(p) {
      const k = p.size + ':' + p.decay;
      if (k !== key) { key = k; conv.buffer = impulse(ctx, p.size, p.decay); }
      w.mix(p.mix);
    } };
  },
  delay(ctx) {
    const w = wetDry(ctx), d = ctx.createDelay(2), fb = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 4500;
    w.input.connect(d); d.connect(f).connect(fb).connect(d); f.connect(w.wet);
    return { input: w.input, output: w.output, set(p, bpm = 120) {
      let time = p.time;
      if (p.sync) { const sixteenth = 15 / bpm; time = Math.max(1, Math.round(time / sixteenth)) * sixteenth; }
      d.delayTime.value = Math.min(time, 2); fb.gain.value = p.feedback; w.mix(p.mix);
    } };
  },
  distortion(ctx) {
    const w = wetDry(ctx), sh = ctx.createWaveShaper(), tone = ctx.createBiquadFilter(), trim = ctx.createGain();
    sh.oversample = '4x'; tone.type = 'lowpass';
    w.input.connect(sh).connect(tone).connect(trim).connect(w.wet);
    return { input: w.input, output: w.output, set(p) {
      sh.curve = driveCurve(p.drive); tone.frequency.value = p.tone; trim.gain.value = 1 - p.drive * 0.4; w.mix(p.mix);
    } };
  },
  filter(ctx) {
    const f = ctx.createBiquadFilter();
    return { input: f, output: f, set(p) {
      f.type = ['lowpass', 'highpass', 'bandpass'][p.type | 0] || 'lowpass'; f.frequency.value = p.cutoff; f.Q.value = p.res;
    } };
  },
  chorus(ctx) {
    const w = wetDry(ctx), d = ctx.createDelay(0.1), lfo = ctx.createOscillator(), depth = ctx.createGain();
    d.delayTime.value = 0.015;
    lfo.connect(depth).connect(d.delayTime); lfo.start();
    w.input.connect(d).connect(w.wet);
    return { input: w.input, output: w.output, set(p) { lfo.frequency.value = p.rate; depth.gain.value = p.depth; w.mix(p.mix); },
      dispose() { try { lfo.stop(); } catch {} } };
  },
  bitcrush(ctx) {
    const w = wetDry(ctx), sh = ctx.createWaveShaper();
    w.input.connect(sh).connect(w.wet);
    return { input: w.input, output: w.output, set(p) { sh.curve = crushCurve(p.bits | 0); w.mix(p.mix); } };
  },
  stereo(ctx) {
    const input = ctx.createGain(), split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2), d = ctx.createDelay(0.1);
    input.channelCountMode = 'explicit'; input.channelCount = 2;
    input.connect(split);
    split.connect(merge, 0, 0);
    split.connect(d, 1); d.connect(merge, 0, 1);
    return { input, output: merge, set(p) { d.delayTime.value = p.width; } };
  },
};

export function createFx(ctx, fx, bpm) {
  const unit = FACTORIES[fx.type](ctx);
  unit.set(fx.params, bpm);
  return unit;
}
