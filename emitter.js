export function emitter() {
  const map = new Map();
  return {
    on(event, fn) {
      if (!map.has(event)) map.set(event, new Set());
      map.get(event).add(fn);
      return () => map.get(event)?.delete(fn);
    },
    emit(event, data) {
      map.get(event)?.forEach((fn) => {
        try { fn(data); } catch (err) { console.error(err); }
      });
    },
  };
}
