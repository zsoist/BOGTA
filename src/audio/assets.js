// GTA Bogotá — optional real audio files (ElevenLabs etc.). Everything procedural is the fallback, so every lookup
// here is allowed to fail silently. Existence is probed ONCE (GET, aborted after the headers so nothing big downloads);
// buffers are fetched + decoded lazily on first use and cached.

const KNOWN = [
  'music/tropicombo.mp3', 'music/acordeon.mp3', 'music/perreadera.mp3', 'music/champeta.mp3',
  'music/busted.mp3', 'music/wasted.mp3', 'music/title.mp3',
  'voices/jingle-tropicombo.mp3', 'voices/jingle-acordeon.mp3', 'voices/jingle-perreadera.mp3', 'voices/jingle-champeta.mp3', 'voices/jingle-trancon.mp3',
  'sfx/horn.mp3', 'sfx/siren.mp3', 'sfx/crash.mp3', 'sfx/cash.mp3', 'sfx/rain.mp3', 'sfx/crowd.mp3', 'sfx/whoosh.mp3',
];

const urlOf = (rel) => new URL(`../../assets/${rel}`, import.meta.url).href;

export function createAssets(ctx) {
  const exists = new Map();
  const buffers = new Map();
  const pending = new Map();

  async function probeOne(rel) {
    try {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const res = await fetch(urlOf(rel), { method: 'GET', cache: 'force-cache', signal: ac ? ac.signal : undefined });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const ok = res.ok && (ct.includes('audio') || ct.includes('octet-stream') || ct.includes('mpeg'));
      if (ac) ac.abort(); // headers are enough — don't download the body here
      exists.set(rel, ok);
    } catch { exists.set(rel, false); }
  }

  const api = {
    ready: Promise.all(KNOWN.map(probeOne)).then(() => true, () => true),
    has: (rel) => exists.get(rel) === true,
    /** Already-decoded buffer or undefined (sync). */
    peek: (rel) => buffers.get(rel),
    url: urlOf,
    /** Decoded AudioBuffer or null (never throws). */
    buffer(rel) {
      if (buffers.has(rel)) return Promise.resolve(buffers.get(rel));
      if (pending.has(rel)) return pending.get(rel);
      const p = (async () => {
        try {
          const res = await fetch(urlOf(rel), { cache: 'force-cache' });
          if (!res.ok) throw new Error(String(res.status));
          const data = await res.arrayBuffer();
          const buf = await new Promise((resolve, reject) => {
            const r = ctx.decodeAudioData(data, resolve, reject);
            if (r && r.then) r.then(resolve, reject);
          });
          buffers.set(rel, buf);
          return buf;
        } catch { exists.set(rel, false); return null; } finally { pending.delete(rel); }
      })();
      pending.set(rel, p);
      return p;
    },
    /** Fire-and-forget: start decoding a file we expect to need soon. */
    prefetch(rel) { if (api.has(rel)) api.buffer(rel); },
  };
  return api;
}
