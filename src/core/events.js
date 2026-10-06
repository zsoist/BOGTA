// Tiny global event bus. See docs/CONTRACT.md for the event catalog.
const listeners = new Map();
export const events = {
  on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name)?.delete(fn);
  },
  emit(name, data) {
    const set = listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(data); } catch (err) { console.error(`[events] ${name} handler failed`, err); }
    }
  },
};
