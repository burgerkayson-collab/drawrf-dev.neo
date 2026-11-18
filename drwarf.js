/* ============================================================================
   🪓 drwarf v2 - dig through HTML game variables, saves and memory from the console
   Works on: Cookie Clicker-style JS games, RPG Maker, Phaser, Construct, Godot/Unity web exports (saves + memory)

   USE:  F12 -> Console -> paste this whole file -> run  drwarf.help()
   BEST: for WASM memory scanning (Godot/Unity/etc.) the hook at the top must run BEFORE the
         game loads. Use a userscript (Tampermonkey, @run-at document-start) or Chrome
         DevTools > Sources > Overrides to inject this file. Everything else works when pasted late.

   For your own single-player games and offline tinkering.
   ========================================================================== */
(() => {
  'use strict';
  const D = (window.drwarf = { version: '2.0' });
  const CSS = 'color:#e8a33d;font-weight:bold';
  const log = (...a) => console.log('%c🪓 drwarf', CSS, ...a);
  const warn = (...a) => console.warn('🪓 drwarf:', ...a);
  const TYPES = ['number', 'string', 'boolean', 'function', 'object', 'array', 'bigint', 'null'];

  /* ------------------------------------------------------------------ WASM hook */
  const W = { memories: [] };
  try {
    if (!WebAssembly.__drwarf) {
      const NM = WebAssembly.Memory;
      const grab = (m) => { if (m instanceof NM && !W.memories.includes(m)) W.memories.push(m); };
      WebAssembly.Memory = new Proxy(NM, {
        construct(t, args, nt) { const m = Reflect.construct(t, args, nt); grab(m); return m; },
      });
      const scanExports = (r) => {
        try { for (const v of Object.values((r.instance || r).exports || {})) grab(v); } catch (e) {}
        return r;
      };
      for (const fn of ['instantiate', 'instantiateStreaming']) {
        const orig = WebAssembly[fn];
        if (orig) WebAssembly[fn] = function (...a) { return orig.apply(this, a).then(scanExports); };
      }
      WebAssembly.__drwarf = true;
    }
  } catch (e) {}

  /* ------------------------------------------------------------------ helpers */
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  const prev = (v) => {
    try {
      if (typeof v === 'function') return 'ƒ()';
      if (v && typeof v === 'object')
        return Array.isArray(v) ? `Array(${v.length})` : `{ ${Object.keys(v).slice(0, 6).join(', ')} }`;
      return String(v).slice(0, 70);
    } catch (e) { return '?'; }
  };
  const dl = (name, data, type = 'application/octet-stream') => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };
  const pick = (accept) => new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file'; if (accept) i.accept = accept;
    i.onchange = () => res(i.files[0]); i.click();
  });

  let _base = null;
  const baseline = () => {
    const f = document.createElement('iframe');
    f.style.display = 'none';
    (document.body || document.documentElement).appendChild(f);
    const k = new Set(Object.getOwnPropertyNames(f.contentWindow));
    f.remove();
    return k;
  };
  const userGlobals = () => {
    _base = _base || baseline();
    return Object.getOwnPropertyNames(window).filter((k) => {
      if (_base.has(k) || k === 'drwarf' || k === '__dw') return false;
      try { return !(document.getElementById(k) === window[k] && window[k] instanceof Element); } catch (e) { return true; }
    });
  };

  const walk = (v, path, depth, cb, ctx = { n: 0, seen: new WeakSet() }) => {
    if (ctx.n++ > 60000) return;
    cb(path, v);
    if (depth <= 0 || !v || typeof v !== 'object') return;
    if (ctx.seen.has(v) || v instanceof Node || v === window || ArrayBuffer.isView(v)) return;
    ctx.seen.add(v);
    let keys = [];
    try { keys = Object.keys(v).slice(0, 400); } catch (e) { return; }
    for (const k of keys) {
      let c;
      try { c = v[k]; } catch (e) { continue; }
      walk(c, Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`, depth - 1, cb, ctx);
    }
  };

  const parsePath = (p) => p.replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
  const root = (n) => (n in window ? window[n] : (0, eval)(n)); // also reaches top-level let/const
  const getP = (path) => { const [h, ...r] = parsePath(path); let o = root(h); for (const k of r) o = o[k]; return o; };
  const setP = (path, val) => {
    const ps = parsePath(path);
    if (ps.length === 1) {
      if (ps[0] in window) window[ps[0]] = val;
      else { window.__dw = val; (0, eval)(`${ps[0]}=window.__dw`); delete window.__dw; }
      return;
    }
    const last = ps.pop();
    getP(ps.join('.'))[last] = val;
  };

  /* ================================================================== VARS */
  const vars = (D.vars = {});
  const frozen = new Map(), watched = new Map(), snaps = new Map();

  // vars.list({type, match, deep, depth, limit}) | list('number') | list(/regex/)  -> rows (no printing)
  vars.list = (o = {}) => {
    if (typeof o === 'string') o = TYPES.includes(o) ? { type: o } : { match: new RegExp(o, 'i') };
    else if (o instanceof RegExp) o = { match: o };
    const { type, match, deep = false, depth = 3, limit = 1000 } = o;
    const rows = [];
    const ok = (t, p) => (!type || t === type) && (!match || match.test(p));
    for (const k of userGlobals()) {
      let v;
      try { v = window[k]; } catch (e) { continue; }
      if (deep) {
        walk(v, k, depth, (p, x) => {
          if (rows.length >= limit) return;
          const t = typeOf(x);
          if (t === 'object' || t === 'array' || t === 'function' || t === 'null') return;
          if (ok(t, p)) rows.push({ path: p, type: t, value: x });
        });
      } else {
        const t = typeOf(v);
        if (ok(t, k)) rows.push({ path: k, type: t, value: t === 'number' || t === 'boolean' ? v : prev(v) });
      }
    }
    return rows;
  };

  // vars.show()  /  vars.show('number')  /  vars.show(/gold/i)  /  vars.show({deep:true, type:'number'})
  vars.show = (o) => {
    const rows = vars.list(o);
    log(`${rows.length} variables`);
    console.table(rows);
  };

  // vars.find(1234) -> where does this value live? (deep). Strings match by substring.
  vars.find = (target, depth = 3) => {
    const hits = [];
    for (const k of userGlobals()) {
      try {
        walk(window[k], k, depth, (p, v) => {
          if (v === target || (typeof target === 'string' && typeof v === 'string' && v.includes(target)) ||
              (typeof target === 'number' && typeof v === 'number' && Math.abs(v - target) < 1e-6 && !Number.isInteger(target)))
            hits.push({ path: p, value: prev(v) });
        });
      } catch (e) {}
    }
    log(`${hits.length} matches for`, target);
    console.table(hits);
  };

  // vars.key(/gold|money/i) -> search variable NAMES deep
  vars.key = (re, depth = 3) => {
    re = re instanceof RegExp ? re : new RegExp(re, 'i');
    const hits = [];
    for (const k of userGlobals()) {
      try {
        walk(window[k], k, depth, (p, v) => {
          const last = p.split(/[.\[]/).pop();
          if (re.test(last)) hits.push({ path: p, type: typeOf(v), value: prev(v) });
        });
      } catch (e) {}
    }
    log(`${hits.length} names match ${re}`);
    console.table(hits.slice(0, 500));
  };

  // vars.snap('a') ... act in game ... vars.diff('a')
  const grab = () => {
    const m = new Map();
    for (const k of userGlobals()) {
      try { walk(window[k], k, 3, (p, v) => { if (['number', 'boolean', 'string'].includes(typeof v)) m.set(p, v); }); } catch (e) {}
    }
    return m;
  };
  vars.snap = (name = 'default') => { snaps.set(name, grab()); log(`snapshot "${name}" saved (${snaps.get(name).size} values)`); };
  vars.diff = (name = 'default') => {
    const s = snaps.get(name);
    if (!s) return warn('no snapshot called', name);
    const rows = [];
    grab().forEach((v, p) => { if (s.has(p) && s.get(p) !== v) rows.push({ path: p, before: s.get(p), after: v }); });
    log(`${rows.length} values changed since "${name}"`);
    console.table(rows);
  };

  vars.get = (path) => getP(path);
  vars.set = (path, val) => { setP(path, val); log(`${path} =`, val); };
  vars.add = (path, n) => vars.set(path, getP(path) + n);
  vars.tree = (path, depth = 2) => {
    const out = {};
    walk(getP(path), path, depth, (p, v) => { out[p] = prev(v); });
    console.table(out);
  };

  // freeze: re-applies the value every 50ms (good for "infinite gold")
  vars.freeze = (path, val) => {
    if (val === undefined) val = getP(path);
    vars.unfreeze(path);
    frozen.set(path, { val, id: setInterval(() => { try { setP(path, val); } catch (e) {} }, 50) });
    log(`froze ${path} at`, val);
  };
  vars.unfreeze = (path) => {
    if (!path) { frozen.forEach((f) => clearInterval(f.id)); frozen.clear(); return; }
    const f = frozen.get(path);
    if (f) { clearInterval(f.id); frozen.delete(path); log('unfroze', path); }
  };
  vars.frozen = () => console.table([...frozen].map(([path, f]) => ({ path, value: f.val })));

  // watch: logs whenever a value changes
  vars.watch = (path) => {
    let last = getP(path);
    vars.unwatch(path);
    watched.set(path, setInterval(() => {
      let now; try { now = getP(path); } catch (e) { return; }
      if (now !== last) { log(`${path}:`, last, '→', now); last = now; }
    }, 100));
    log('watching', path);
  };
  vars.unwatch = (path) => {
    if (!path) { watched.forEach(clearInterval); watched.clear(); return; }
    clearInterval(watched.get(path)); watched.delete(path);
  };

  /* ================================================================== SAVES (localStorage / cookies / etc.) */
  const saves = (D.saves = {});
  const entries = () => {
    const out = [];
    for (const [tag, st] of [['local', localStorage], ['session', sessionStorage]])
      for (let i = 0; i < st.length; i++) out.push({ ref: `${tag}:${st.key(i)}`, value: st.getItem(st.key(i)) });
    document.cookie.split('; ').filter(Boolean).forEach((c) => {
      const [k, ...r] = c.split('=');
      out.push({ ref: `cookie:${k}`, value: r.join('=') });
    });
    return out;
  };
  const splitRef = (ref) => { const i = ref.indexOf(':'); return [ref.slice(0, i), ref.slice(i + 1)]; };
  const rawGet = (ref) => {
    const [w, k] = splitRef(ref);
    if (w === 'local') return localStorage.getItem(k);
    if (w === 'session') return sessionStorage.getItem(k);
    const c = document.cookie.split('; ').find((x) => x.startsWith(k + '='));
    return c ? c.slice(k.length + 1) : null;
  };
  const rawSet = (ref, v) => {
    const [w, k] = splitRef(ref);
    if (w === 'local') localStorage.setItem(k, v);
    else if (w === 'session') sessionStorage.setItem(k, v);
    else document.cookie = `${k}=${v}; path=/; max-age=31536000`;
  };

  const decodeStr = (raw) => {
    if (typeof raw !== 'string') return { fmt: 'raw', data: raw };
    try { return { fmt: 'json', data: JSON.parse(raw) }; } catch (e) {}
    let t = raw, uri = false, end = false;
    try { const u = decodeURIComponent(raw); if (u !== raw) { t = u; uri = true; } } catch (e) {}
    if (t.includes('!END!')) { t = t.split('!END!')[0]; end = true; }
    try {
      const bin = atob(t);
      const printable = /^[\x09\x0a\x0d\x20-\x7e]*$/.test(bin.slice(0, 300));
      let data = bin;
      if (printable) { try { data = JSON.parse(bin); } catch (e) {} }
      return { fmt: 'b64', uri, end, printable, data };
    } catch (e) {}
    return { fmt: 'text', data: raw };
  };
  const encodeStr = (meta, data) => {
    if (meta.fmt === 'json') return JSON.stringify(data);
    const s = typeof data === 'string' ? data : JSON.stringify(data);
    if (meta.fmt !== 'b64') return s;
    let o = btoa(s);
    if (meta.end) o += '!END!';
    if (meta.uri) o = encodeURIComponent(o);
    return o;
  };

  // saves.show() -> table of every save-looking entry
  saves.show = async () => {
    const rows = entries().map(({ ref, value }) => {
      const d = decodeStr(value);
      return { ref, size: value.length, format: d.fmt + (d.end ? '+END' : '') + (d.fmt === 'b64' && !d.printable ? ' (binary)' : ''), peek: value.slice(0, 40) };
    });
    try {
      const dbs = indexedDB.databases ? await indexedDB.databases() : [];
      dbs.forEach((d) => rows.push({ ref: `indexedDB:${d.name}`, size: '-', format: `v${d.version}`, peek: '' }));
    } catch (e) {}
    log(`${rows.length} save entries  (use drwarf.saves.read('ref') to open one)`);
    console.table(rows);
  };
  saves.read = (ref) => { const d = decodeStr(rawGet(ref)); log(ref, `[${d.fmt}]`); return d.data; };
  saves.raw = (ref) => rawGet(ref);
  saves.write = (ref, v) => { rawSet(ref, v); log(`wrote ${ref}. Reload the page so the game loads it.`); };
  // saves.edit('local:key','player.gold',9999)   (JSON or base64-JSON saves)
  saves.edit = (ref, path, val) => {
    const meta = decodeStr(rawGet(ref));
    if (typeof meta.data !== 'object') return warn('save is not JSON; use saves.patch(ref, from, to)');
    const ps = parsePath(path), last = ps.pop();
    let o = meta.data; for (const k of ps) o = o[k];
    o[last] = val;
    saves.write(ref, encodeStr(meta, meta.data));
  };
  // saves.patch('local:CookieClickerGame','old text','new text')  (text/base64-text saves)
  saves.patch = (ref, from, to) => {
    const meta = decodeStr(rawGet(ref));
    const s = typeof meta.data === 'string' ? meta.data : JSON.stringify(meta.data);
    if (!s.includes(from)) return warn('text not found');
    saves.write(ref, encodeStr(meta, s.split(from).join(to)));
  };
  saves.backup = () => { dl('drwarf-backup.json', JSON.stringify(entries()), 'application/json'); log('backup downloaded'); };
  saves.restore = async () => {
    const f = await pick('.json'); if (!f) return;
    JSON.parse(await f.text()).forEach((e) => rawSet(e.ref, e.value));
    log('restored. Reload the page.');
  };
  saves.export = (ref) => { dl(splitRef(ref)[1] + '.sav', rawGet(ref)); log('exported', ref); };
  saves.import = async (ref) => { const f = await pick(); if (f) saves.write(ref, await f.text()); };
  saves.clear = (ref) => {
    const [w, k] = splitRef(ref);
    if (w === 'local') localStorage.removeItem(k); else if (w === 'session') sessionStorage.removeItem(k);
    else document.cookie = `${k}=; max-age=0; path=/`;
    log('deleted', ref);
  };

  /* ================================================================== GODOT user:// saves */
  const godot = (D.godot = {});
  const GDB = '/userfs', GST = 'FILE_DATA';
  const openDB = () => new Promise((res, rej) => { const r = indexedDB.open(GDB); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const sniffBytes = (b) => {
    const head = String.fromCharCode(...b.slice(0, 4));
    if (['GDEC', 'GDSC', 'GDPC'].includes(head)) return 'encrypted/compiled';
    if (head === 'RSRC' || head === 'RSCC') return 'binary resource';
    const txt = new TextDecoder().decode(b.slice(0, 400));
    if (/^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]*$/.test(txt)) {
      try { JSON.parse(new TextDecoder().decode(b)); return 'JSON text'; } catch (e) {}
      return /^\s*\[.+\]/m.test(txt) ? 'ConfigFile/.tres text' : 'text';
    }
    return 'binary (store_var etc.)';
  };
  const gGet = async (path) => {
    const db = await openDB();
    return new Promise((res, rej) => {
      const r = db.transaction(GST).objectStore(GST).get(path);
      r.onsuccess = () => { db.close(); r.result ? res(r.result) : rej(new Error('no such file ' + path)); };
      r.onerror = () => rej(r.error);
    });
  };
  godot.show = async () => {
    const db = await openDB(), rows = [];
    await new Promise((res) => {
      const c = db.transaction(GST).objectStore(GST).openCursor();
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return res();
        const v = cur.value;
        if (v && v.contents) rows.push({ path: cur.key, bytes: v.contents.length, kind: sniffBytes(v.contents), modified: v.timestamp && new Date(v.timestamp).toLocaleString() });
        cur.continue();
      };
    });
    db.close();
    log(`${rows.length} files in user://`);
    console.table(rows);
  };
  godot.read = async (path) => {
    const rec = await gGet(path), kind = sniffBytes(rec.contents);
    log(path, '-', kind);
    if (/binary|encrypted/.test(kind)) { console.log([...rec.contents.slice(0, 64)].map((b) => b.toString(16).padStart(2, '0')).join(' ')); return rec.contents; }
    const text = new TextDecoder().decode(rec.contents);
    try { return JSON.parse(text); } catch (e) { return text; }
  };
  godot.write = async (path, data) => {
    const rec = await gGet(path);
    rec.contents = new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data));
    rec.timestamp = new Date();
    const db = await openDB();
    await new Promise((res, rej) => { const t = db.transaction(GST, 'readwrite'); t.objectStore(GST).put(rec, path); t.oncomplete = res; t.onerror = () => rej(t.error); });
    db.close();
    log(`wrote ${path}. Reload the page (before the game autosaves).`);
  };
  godot.patch = async (path, from, to) => {
    const text = new TextDecoder().decode((await gGet(path)).contents);
    if (!text.includes(from)) return warn('text not found');
    await godot.write(path, text.split(from).join(to));
  };
  godot.download = async (path) => { dl(path.split('/').pop(), (await gGet(path)).contents); log('downloaded', path); };

  /* ================================================================== MEMORY (Cheat-Engine style, WASM games) */
  const mem = (D.mem = {});
  const TY = { i32: [Int32Array, 4], u32: [Uint32Array, 4], f32: [Float32Array, 4], f64: [Float64Array, 8], i16: [Int16Array, 2], u8: [Uint8Array, 1] };
  const M = { cands: null, prev: null, type: 'i32' };
  const memFrozen = new Map();
  const buf = () => {
    const best = [...W.memories].sort((a, b) => b.buffer.byteLength - a.buffer.byteLength)[0];
    if (best) return best.buffer;
    for (const f of [() => window.Module.HEAPU8.buffer, () => window.wasmMemory.buffer, () => window.Module.wasmMemory.buffer]) {
      try { const b = f(); if (b) return b; } catch (e) {}
    }
    return null;
  };
  const isF = (t) => t[0] === 'f';
  const eq = (t, x, v) => (isF(t) ? Math.abs(x - v) <= 1e-3 * Math.max(1, Math.abs(v)) : x === v);
  const report = () => {
    log(`${M.cands.length} candidates`);
    if (M.cands.length <= 25) mem.list();
    else log('narrow it down: change the value in-game, then mem.next(newValue)  |  mem.next("changed"/"unchanged"/"inc"/"dec")');
  };
  mem.status = () => {
    const b = buf();
    log(b ? `memory found: ${(b.byteLength / 1048576).toFixed(1)} MB (${W.memories.length} captured)` :
      'no WASM memory found. Inject drwarf BEFORE the game loads (userscript at document-start / DevTools Overrides).');
  };
  // mem.scan(1234) / mem.scan(12.5,'f32')  types: i32 u32 f32 f64 i16 u8
  mem.scan = (value, type = 'i32') => {
    const b = buf();
    if (!b) return mem.status();
    const [C, sz] = TY[type];
    const arr = new C(b, 0, Math.floor(b.byteLength / sz));
    const c = [], p = [], f = isF(type), tol = 1e-3 * Math.max(1, Math.abs(value));
    for (let i = 0; i < arr.length && c.length < 3e6; i++) {
      const x = arr[i];
      if (f ? Math.abs(x - value) <= tol : x === value) { c.push(i); p.push(x); }
    }
    M.cands = c; M.prev = p; M.type = type;
    report();
  };
  mem.next = (mode) => {
    if (!M.cands) return warn('run mem.scan(value) first');
    const b = buf(), [C, sz] = TY[M.type], arr = new C(b, 0, Math.floor(b.byteLength / sz));
    const c = [], p = [];
    for (let i = 0; i < M.cands.length; i++) {
      const idx = M.cands[i], x = arr[idx], old = M.prev[i];
      const ok = typeof mode === 'number' ? eq(M.type, x, mode) :
        mode === 'changed' ? x !== old : mode === 'unchanged' ? x === old :
        mode === 'inc' ? x > old : mode === 'dec' ? x < old : false;
      if (ok) { c.push(idx); p.push(x); }
    }
    M.cands = c; M.prev = p;
    report();
  };
  mem.list = (n = 25) => {
    if (!M.cands) return warn('nothing scanned yet');
    const b = buf(), [C, sz] = TY[M.type], arr = new C(b, 0, Math.floor(b.byteLength / sz));
    console.table(M.cands.slice(0, n).map((idx, i) => ({ address: '0x' + (idx * sz).toString(16), value: arr[idx], previous: M.prev[i] })));
  };
  const setters = { i32: 'setInt32', u32: 'setUint32', f32: 'setFloat32', f64: 'setFloat64', i16: 'setInt16', u8: 'setUint8' };
  mem.poke = (addr, val, type = M.type) => {
    addr = typeof addr === 'string' ? parseInt(addr, 16) : addr;
    new DataView(buf())[setters[type]](addr, val, true);
    log(`poked 0x${addr.toString(16)} = ${val}`);
  };
  mem.freeze = (addr, val, type = M.type) => {
    addr = typeof addr === 'string' ? parseInt(addr, 16) : addr;
    mem.unfreeze(addr);
    memFrozen.set(addr, setInterval(() => { try { new DataView(buf())[setters[type]](addr, val, true); } catch (e) {} }, 50));
    log(`froze 0x${addr.toString(16)} at ${val}`);
  };
  mem.unfreeze = (addr) => {
    if (addr === undefined) { memFrozen.forEach(clearInterval); memFrozen.clear(); return; }
    clearInterval(memFrozen.get(addr)); memFrozen.delete(addr);
  };
  mem.reset = () => { M.cands = M.prev = null; log('scan cleared'); };
  // mem.str('PlayerName') -> find a text string in memory
  mem.str = (text, max = 30) => {
    const b = buf(); if (!b) return mem.status();
    const u8 = new Uint8Array(b), pat = new TextEncoder().encode(text), hits = [];
    let pos = 0;
    while (hits.length < max && (pos = u8.indexOf(pat[0], pos)) !== -1) {
      let ok = true;
      for (let j = 1; j < pat.length; j++) if (u8[pos + j] !== pat[j]) { ok = false; break; }
      if (ok) hits.push({ address: '0x' + pos.toString(16), context: new TextDecoder().decode(u8.slice(pos, pos + 48)).replace(/[^\x20-\x7e]/g, '·') });
      pos++;
    }
    log(`${hits.length} hits`); console.table(hits);
  };

  /* ================================================================== UI (floating panel) */
  const ui = (D.ui = {});
  ui.open = () => {
    if (ui.host) return;
    const host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;top:10px;right:10px;z-index:2147483647';
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>
      .p{width:340px;background:#1e1b16;color:#eee;font:12px monospace;border:1px solid #e8a33d;border-radius:6px;box-shadow:0 4px 18px #0008}
      .h{background:#e8a33d;color:#1e1b16;padding:4px 8px;font-weight:bold;cursor:move;display:flex;justify-content:space-between}
      .x{cursor:pointer}.c{padding:6px;display:flex;gap:4px}
      input,select,button{font:12px monospace;background:#2b2720;color:#eee;border:1px solid #554;border-radius:3px}
      .f{flex:1;min-width:0}.l{max-height:380px;overflow:auto;padding:0 6px 6px}
      .r{display:flex;gap:4px;margin:2px 0;align-items:center}.n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
      .r input{width:110px}.on{background:#4a90c2}
    </style><div class=p><div class=h><span>🪓 drwarf</span><span class=x>✕</span></div>
    <div class=c><input class=f placeholder="filter by name…"><select><option>number</option><option>string</option><option>boolean</option><option value="">all</option></select></div>
    <div class=l></div></div>`;
    document.documentElement.appendChild(host);
    ui.host = host;
    const $ = (s) => sh.querySelector(s);
    const list = $('.l'), filt = $('.f'), sel = $('select');
    $('.x').onclick = ui.close;
    let dx, dy, drag = false;
    $('.h').onmousedown = (e) => { drag = true; const r = host.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top; };
    addEventListener('mousemove', ui._mm = (e) => { if (drag) { host.style.left = e.clientX - dx + 'px'; host.style.top = e.clientY - dy + 'px'; host.style.right = 'auto'; } });
    addEventListener('mouseup', ui._mu = () => (drag = false));
    const render = () => {
      if (sh.activeElement && list.contains(sh.activeElement)) return; // don't clobber editing
      let match; try { match = filt.value ? new RegExp(filt.value, 'i') : undefined; } catch (e) {}
      const rows = vars.list({ deep: true, depth: 2, type: sel.value || undefined, match, limit: 150 });
      list.textContent = '';
      for (const r of rows) {
        const row = document.createElement('div'); row.className = 'r';
        const n = document.createElement('span'); n.className = 'n'; n.textContent = r.path; n.title = r.path;
        const inp = document.createElement('input'); inp.value = r.value;
        inp.onchange = () => { try { setP(r.path, r.type === 'number' ? Number(inp.value) : r.type === 'boolean' ? inp.value === 'true' : inp.value); } catch (e) { warn(e.message); } };
        const b = document.createElement('button'); b.textContent = '❄'; if (frozen.has(r.path)) b.className = 'on';
        b.onclick = () => { frozen.has(r.path) ? vars.unfreeze(r.path) : vars.freeze(r.path, r.type === 'number' ? Number(inp.value) : r.value); b.classList.toggle('on'); };
        row.append(n, inp, b); list.append(row);
      }
      if (!rows.length) list.textContent = 'no matches (game may keep vars in a closure; try drwarf.saves.show())';
    };
    ui._t = setInterval(render, 700); render();
    filt.oninput = render; sel.onchange = render;
  };
  ui.close = () => {
    if (!ui.host) return;
    clearInterval(ui._t); removeEventListener('mousemove', ui._mm); removeEventListener('mouseup', ui._mu);
    ui.host.remove(); ui.host = null;
  };
  ui.toggle = () => (ui.host ? ui.close() : ui.open());

  /* ================================================================== DETECT / SCAN-ALL */
  D.detect = () => {
    const checks = [
      ['Godot', () => window.Engine && window.Engine.startGame, 'saves: drwarf.godot.show() | live vars: drwarf.mem (needs early injection)'],
      ['Unity WebGL', () => window.createUnityInstance || window.unityInstance, 'saves: drwarf.saves.show() / IndexedDB | live vars: drwarf.mem'],
      ['RPG Maker MV/MZ', () => window.$gameVariables, 'try drwarf.vars.tree("$gameParty") and drwarf.vars.tree("$gameVariables")'],
      ['Phaser', () => window.Phaser, 'game state is usually inside a Phaser.Game instance: drwarf.vars.show({type:"object"})'],
      ['Construct 2/3', () => window.cr_getC2Runtime || window.C3, 'try drwarf.vars.tree("cr_getC2Runtime().running_layout")'],
      ['PixiJS', () => window.PIXI, 'visual layer only; look for the game object in drwarf.vars.show()'],
      ['GameMaker', () => window.GameMaker_Init, 'compiled; use drwarf.saves.show() and drwarf.mem'],
      ['Cookie Clicker style (Game object)', () => window.Game && window.Game.cookies !== undefined, 'drwarf.vars.tree("Game") then drwarf.vars.set("Game.cookies", 1e12)'],
    ];
    const found = checks.filter(([, t]) => { try { return t(); } catch (e) { return false; } }).map(([n, , h]) => ({ engine: n, hint: h }));
    return found;
  };
  D.scan = async () => {
    log('--- overview ---');
    const eng = D.detect();
    eng.length ? console.table(eng) : log('no known engine detected (plain JS game?)');
    log(`${userGlobals().length} game-added globals. Top-level numbers:`);
    vars.show('number');
    await saves.show();
    mem.status();
  };

  D.reset = () => { vars.unfreeze(); vars.unwatch(); mem.unfreeze(); ui.close(); log('all freezes, watches and UI stopped'); };

  D.help = () => console.log(`%c🪓 drwarf v${D.version}
 drwarf.scan()                      overview: engine, globals, saves, memory
 drwarf.ui.open()                   floating panel: filter, edit values, ❄ freeze

 VARS
 drwarf.vars.show()                 table of game globals     .show('number') .show(/gold/i) .show({deep:true,type:'number'})
 drwarf.vars.find(1234)             where does this value live?
 drwarf.vars.key(/gold|coin/i)      search variable NAMES (deep)
 drwarf.vars.snap('a') / .diff('a') change something in game, see what moved
 drwarf.vars.tree('Game')           inspect an object        .get(path) .set(path,val) .add(path,n)
 drwarf.vars.freeze(path[,val])     lock a value             .unfreeze([path]) .frozen()
 drwarf.vars.watch(path)            log changes              .unwatch([path])

 SAVES (localStorage / sessionStorage / cookies)
 drwarf.saves.show()                list saves + detected format
 drwarf.saves.read('local:key')     decoded (JSON / base64 / Cookie Clicker style)
 drwarf.saves.edit(ref,'a.b',val)   edit a JSON field     .patch(ref,from,to) for text saves
 drwarf.saves.backup() / .restore() / .export(ref) / .import(ref) / .write(ref,raw) / .clear(ref)

 GODOT user://
 drwarf.godot.show() / .read(path) / .patch(path,from,to) / .write(path,data) / .download(path)

 MEMORY (WASM games - Godot, Unity, GameMaker...)  needs early injection, see top of file
 drwarf.mem.status()
 drwarf.mem.scan(100)               then change value in-game -> .next(120) ... until few remain
 drwarf.mem.next('changed'|'unchanged'|'inc'|'dec'|number)
 drwarf.mem.list() / .poke(addr,val) / .freeze(addr,val) / .unfreeze() / .str('text') / .reset()

 drwarf.reset()                     stop all freezes/watches/UI
 Notes: top-level let/const variables aren't on window, but vars.get/set/freeze still reach them by name.
        Reload the page after editing saves.`, CSS);

  log(`v${D.version} loaded. Type drwarf.help()  |  drwarf.scan() for an overview`);
  const eng = D.detect();
  if (eng.length) log('detected:', eng.map((e) => e.engine).join(', '));
})();
