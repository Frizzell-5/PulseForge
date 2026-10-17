// Instruments: synthesized drums, subtractive/FM synths and a sampler.
// Every instrument exposes trigger(ctx, out, ch, t, pitch, vel, bank) -> { release(time) }.

const noiseCache = new WeakMap();
function noiseBuffer(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

const curveCache = new Map();
export function driveCurve(amount) {
  const k = Math.round(amount * 100);
  if (curveCache.has(k)) return curveCache.get(k);
  const n = 2048, c = new Float32Array(n), a = 1 + amount * 60;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(a * x) / Math.tanh(a); }
  curveCache.set(k, c);
  return c;
}

const midiHz = p => 440 * Math.pow(2, (p - 69) / 12);

function noise(ctx, t, dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
  return s;
}

function env(ctx, t, peak, decay, attack = 0.001) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

// ---------- Drums ----------
const DRUMS = {
  kick(ctx, out, t, v, semi, dec, tone) {
    const len = 0.5 * dec;
    const o = ctx.createOscillator();
    const r = Math.pow(2, semi / 12);
    o.frequency.setValueAtTime(160 * r, t);
    o.frequency.exponentialRampToValueAtTime(48 * r, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(40 * r, t + len);
    const g = env(ctx, t, v, len);
    const sh = ctx.createWaveShaper(); sh.curve = driveCurve(tone * 0.5);
    o.connect(sh).connect(g).connect(out);
    o.start(t); o.stop(t + len + 0.05);
    const c = noise(ctx, t, 0.01), cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 3000;
    c.connect(cf).connect(env(ctx, t, v * 0.25 * tone, 0.008)).connect(out);
  },
  snare(ctx, out, t, v, semi, dec, tone) {
    const r = Math.pow(2, semi / 12);
    const n = noise(ctx, t, 0.3 * dec), f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1200 + tone * 2000;
    n.connect(f).connect(env(ctx, t, v * 0.7, 0.22 * dec)).connect(out);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(220 * r, t); o.frequency.exponentialRampToValueAtTime(160 * r, t + 0.1);
    o.connect(env(ctx, t, v * 0.6, 0.12 * dec)).connect(out);
    o.start(t); o.stop(t + 0.3);
  },
  clap(ctx, out, t, v, semi, dec, tone) {
    const n = noise(ctx, t, 0.4 * dec), f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1100 * Math.pow(2, semi / 12) + tone * 800; f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    [0, 0.011, 0.023].forEach(o => {
      g.gain.setValueAtTime(v, t + o);
      g.gain.exponentialRampToValueAtTime(0.1 * v, t + o + 0.01);
    });
    g.gain.setValueAtTime(v * 0.8, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.033 + 0.25 * dec);
    n.connect(f).connect(g).connect(out);
  },
  hat(ctx, out, t, v, semi, dec, tone, open = false) {
    const len = (open ? 0.35 : 0.055) * dec;
    const bus = ctx.createGain();
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500 * Math.pow(2, semi / 12) + tone * 2000;
    // Metallic partials (TR-808 style) mixed with noise
    [2, 3, 4.16, 5.43, 6.79, 8.21].forEach(m => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 40 * m * Math.pow(2, semi / 12) * 4;
      o.connect(bus); o.start(t); o.stop(t + len + 0.05);
    });
    const ng = ctx.createGain(); ng.gain.value = 1.5;
    noise(ctx, t, len).connect(ng).connect(bus);
    bus.gain.value = 0.12;
    bus.connect(f).connect(env(ctx, t, v, len)).connect(out);
  },
  openhat(ctx, out, t, v, semi, dec, tone) { DRUMS.hat(ctx, out, t, v, semi, dec, tone, true); },
  tom(ctx, out, t, v, semi, dec) {
    const r = Math.pow(2, semi / 12), o = ctx.createOscillator();
    o.frequency.setValueAtTime(180 * r, t); o.frequency.exponentialRampToValueAtTime(90 * r, t + 0.3 * dec);
    o.connect(env(ctx, t, v, 0.4 * dec)).connect(out); o.start(t); o.stop(t + 0.5 * dec);
  },
  rim(ctx, out, t, v, semi, dec) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1700 * Math.pow(2, semi / 12);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 3;
    o.connect(f).connect(env(ctx, t, v * 1.5, 0.035 * dec)).connect(out); o.start(t); o.stop(t + 0.1);
  },
  perc(ctx, out, t, v, semi, dec, tone) {
    const r = Math.pow(2, semi / 12), c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain();
    c.frequency.value = 600 * r; m.frequency.value = 600 * r * (1.5 + tone * 2);
    mg.gain.setValueAtTime(800, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.1);
    m.connect(mg).connect(c.frequency);
    c.connect(env(ctx, t, v * 0.8, 0.15 * dec)).connect(out);
    c.start(t); m.start(t); c.stop(t + 0.3); m.stop(t + 0.3);
  },
};

function triggerDrum(ctx, out, ch, t, pitch, vel) {
  const p = ch.params, fn = DRUMS[p.kit] || DRUMS.kick;
  fn(ctx, out, t, vel, (p.tune || 0) + (pitch - 60), p.decay ?? 1, p.tone ?? 0.5);
  return { release() {} };
}

// ---------- Synths ----------
function triggerSynth(ctx, out, ch, t, pitch, vel) {
  const p = ch.params;
  const freq = midiHz(pitch + 12 * (p.octave || 0));
  const amp = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass'; filt.Q.value = p.res || 0.0001;
  const cutoff = Math.min(p.cutoff || 8000, 20000);
  if (p.filterEnv) {
    filt.frequency.setValueAtTime(Math.min(cutoff * (1 + p.filterEnv * 4), 20000), t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(cutoff * 0.3, 60), t + (p.decay || 0.2) * 1.5);
  } else filt.frequency.setValueAtTime(cutoff, t);

  const oscs = [];
  if (p.fm) {
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain();
    c.frequency.value = freq; m.frequency.value = freq * (p.ratio || 2);
    const idx = freq * (p.index || 2);
    mg.gain.setValueAtTime(idx, t);
    mg.gain.setTargetAtTime(idx * 0.15, t, (p.decay || 0.5) / 2);
    m.connect(mg).connect(c.frequency);
    c.connect(filt); oscs.push(c, m);
  } else {
    const nv = Math.max(1, p.voices || 1), mix = ctx.createGain();
    mix.gain.value = 1 / Math.sqrt(nv);
    for (let i = 0; i < nv; i++) {
      const o = ctx.createOscillator(); o.type = p.wave || 'sawtooth';
      const spread = nv > 1 ? (i / (nv - 1) - 0.5) * 2 : 0;
      o.detune.value = spread * (p.detune || 0);
      if (p.glide808) {
        o.frequency.setValueAtTime(freq * 2.2, t);
        o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
      } else o.frequency.value = freq;
      if (nv > 1 && ctx.createStereoPanner) {
        const pn = ctx.createStereoPanner(); pn.pan.value = spread * 0.6; o.connect(pn).connect(mix);
      } else o.connect(mix);
      oscs.push(o);
    }
    if (p.drive) {
      const sh = ctx.createWaveShaper(); sh.curve = driveCurve(p.drive); mix.connect(sh).connect(filt);
    } else mix.connect(filt);
  }
  filt.connect(amp).connect(out);

  const a = Math.max(p.attack ?? 0.01, 0.001), d = Math.max(p.decay ?? 0.2, 0.01), s = p.sustain ?? 0.7, r = Math.max(p.release ?? 0.2, 0.01);
  const peak = vel * 0.5;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + a);
  amp.gain.setTargetAtTime(Math.max(s * peak, 0.00001), t + a, d / 3);
  oscs.forEach(o => o.start(t));
  let released = false;
  return {
    release(time) {
      if (released) return; released = true;
      const rt = Math.max(time, t + a + 0.003);
      amp.gain.cancelScheduledValues(rt);
      amp.gain.setTargetAtTime(0, rt, r / 4);
      oscs.forEach(o => o.stop(rt + r * 1.6 + 0.05));
    },
  };
}

// ---------- Sampler ----------
function triggerSampler(ctx, out, ch, t, pitch, vel, bank) {
  const p = ch.params;
  const entry = bank && bank.get(p.sampleId);
  if (!entry) return { release() {} };
  const buf = p.reverse ? entry.reversed(ctx) : entry.buffer(ctx);
  if (!buf) return { release() {} };
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = Math.pow(2, (pitch - (ch.root || 60)) / 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + (p.attack || 0.001));
  src.connect(g).connect(out);
  src.start(t);
  let released = false;
  return {
    release(time) {
      if (released || p.oneShot) return; released = true;
      const rt = Math.max(time, t + 0.005);
      g.gain.cancelScheduledValues(rt);
      g.gain.setTargetAtTime(0, rt, (p.release || 0.05) / 4);
      src.stop(rt + (p.release || 0.05) * 2 + 0.05);
    },
  };
}

export function trigger(ctx, out, ch, t, pitch, vel, bank) {
  if (ch.type === 'drum') return triggerDrum(ctx, out, ch, t, pitch, vel);
  if (ch.type === 'sampler') return triggerSampler(ctx, out, ch, t, pitch, vel, bank);
  return triggerSynth(ctx, out, ch, t, pitch, vel);
}
