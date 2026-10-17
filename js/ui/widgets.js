// Small reusable UI helpers.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => c != null && el.append(c instanceof Node ? c : document.createTextNode(c)));
  return el;
}

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export { css };

// Rotary knob drawn on a canvas. Drag up/down (or scroll) to change, double-click to reset.
export function knob({ value, min, max, def = value, color, title, onInput, onCommit, size = 26 }) {
  const c = h('canvas', { class: 'knob', title });
  const dpr = window.devicePixelRatio || 1;
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = size + 'px';
  let v = value;
  const draw = () => {
    const g = c.getContext('2d'), r = size * dpr / 2;
    g.clearRect(0, 0, c.width, c.height);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, t = (v - min) / (max - min);
    g.lineWidth = 3 * dpr; g.lineCap = 'round';
    g.strokeStyle = css('--step-off-alt'); g.beginPath(); g.arc(r, r, r - 3 * dpr, a0, a1); g.stroke();
    g.strokeStyle = color || css('--accent'); g.beginPath();
    if (min < 0 && max > 0) { const mid = a0 + (a1 - a0) * (-min / (max - min)); g.arc(r, r, r - 3 * dpr, Math.min(mid, a0 + (a1 - a0) * t), Math.max(mid, a0 + (a1 - a0) * t)); }
    else g.arc(r, r, r - 3 * dpr, a0, a0 + (a1 - a0) * t);
    g.stroke();
  };
  const set = nv => { v = Math.min(max, Math.max(min, nv)); draw(); onInput && onInput(v); };
  c.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    c.setPointerCapture(e.pointerId);
    const sy = e.clientY, sv = v;
    const move = ev => set(sv + (sy - ev.clientY) / 120 * (max - min) * (ev.shiftKey ? 0.2 : 1));
    const up = () => { c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); onCommit && onCommit(v); };
    c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
  });
  c.addEventListener('wheel', e => { e.preventDefault(); set(v - Math.sign(e.deltaY) * (max - min) / 50); onCommit && onCommit(v); }, { passive: false });
  c.addEventListener('dblclick', () => { set(def); onCommit && onCommit(v); });
  draw();
  return c;
}

// Labeled slider row for parameter editors
export function paramRow(label, value, [min, max, step], onInput, onCommit, fmt = v => +(+v).toFixed(3)) {
  const out = h('output', {}, fmt(value));
  const inp = h('input', { type: 'range', min, max, step, value });
  inp.addEventListener('input', () => { out.textContent = fmt(inp.value); onInput(+inp.value); });
  inp.addEventListener('change', () => onCommit && onCommit(+inp.value));
  inp.addEventListener('pointerdown', e => e.stopPropagation());
  return h('label', { class: 'param' }, h('span', {}, label), inp, out);
}

// Sizes a canvas to its host element, accounting for device pixel ratio
export function fitCanvas(canvas, host) {
  const dpr = window.devicePixelRatio || 1;
  const w = host.clientWidth, hgt = host.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = hgt + 'px';
  }
  return { w, h: hgt, dpr };
}
