// Sample bank: decoded AudioBuffers kept in memory, raw bytes persisted in IndexedDB.
import { uid } from '../state.js';

const DB = 'pulseforge', STORE = 'samples';

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idb(mode, fn) {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
    });
  } catch (e) { console.warn('IndexedDB unavailable', e); return null; }
}

let decodeCtx;
const decoder = () => decodeCtx || (decodeCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 1, 44100));

export class SampleBank {
  constructor() { this.items = new Map(); }

  get(id) { return this.items.get(id); }

  async add(name, bytes, id = uid()) {
    const buf = await decoder().decodeAudioData(bytes.slice(0));
    let rev = null;
    const entry = {
      id, name, bytes, buffer: () => buf,
      reversed: () => rev || (rev = reverse(buf)),
      duration: buf.duration,
    };
    this.items.set(id, entry);
    idb('readwrite', s => s.put({ name, bytes }, id));
    return entry;
  }

  async restore(ids) {
    for (const id of ids) {
      if (!id || this.items.has(id)) continue;
      const rec = await idb('readonly', s => s.get(id));
      if (rec) await this.add(rec.name, rec.bytes, id).catch(() => {});
    }
  }

  // For project files: embed samples as base64
  serialize(ids) {
    const out = {};
    ids.forEach(id => { const e = this.items.get(id); if (e) out[id] = { name: e.name, data: toB64(e.bytes) }; });
    return out;
  }
  async deserialize(obj = {}) {
    for (const [id, { name, data }] of Object.entries(obj)) await this.add(name, fromB64(data), id).catch(() => {});
  }
}

function reverse(buf) {
  const ctx = decoder();
  const r = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) r.getChannelData(c).set(buf.getChannelData(c).slice().reverse());
  return r;
}

function toB64(bytes) {
  const u = new Uint8Array(bytes); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}
