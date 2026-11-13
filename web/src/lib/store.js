// Everything the app remembers lives in localStorage on this device. Nothing here
// touches the network. If storage is blocked (private windows), it falls back to
// memory for the session so the app still works.
const PREFIX = "cc:";

export function createStore(storage, universityId) {
  const memory = new Map();
  const safe = {
    get(k) { try { return storage.getItem(k); } catch { return memory.get(k) ?? null; } },
    set(k, v) { try { storage.setItem(k, v); } catch { memory.set(k, v); } },
    del(k) { try { storage.removeItem(k); } catch { memory.delete(k); } },
    keys() {
      try { return Array.from({ length: storage.length }, (_, i) => storage.key(i)); }
      catch { return [...memory.keys()]; }
    },
  };
  const realKey = `${PREFIX}${universityId}:entries`;
  const demoKey = `${PREFIX}${universityId}:demo`;
  const demoFlag = `${PREFIX}${universityId}:demoOn`;
  const langKey = `${PREFIX}lang`;

  const read = (k) => {
    try { const v = JSON.parse(safe.get(k) ?? "[]"); return Array.isArray(v) ? v : []; }
    catch { return []; }
  };

  const api = {
    isDemo: () => safe.get(demoFlag) === "1",
    /** Real and demo entries are separate keys, so demo mode never touches real answers. */
    setDemo(on, seed = []) {
      if (on) { safe.set(demoFlag, "1"); safe.set(demoKey, JSON.stringify(seed)); }
      else { safe.del(demoFlag); safe.del(demoKey); }
    },
    entries() {
      const list = read(api.isDemo() ? demoKey : realKey);
      return list.sort((a, b) => a.week.localeCompare(b.week));
    },
    entryForWeek(week) { return api.entries().find((e) => e.week === week) ?? null; },
    /** One entry per week: a new check-in replaces that week's earlier one. */
    save(entry) {
      const key = api.isDemo() ? demoKey : realKey;
      const next = read(key).filter((e) => e.week !== entry.week).concat(entry);
      safe.set(key, JSON.stringify(next));
    },
    getLang: () => safe.get(langKey),
    setLang: (l) => safe.set(langKey, l),
    /** Delete every key this app wrote, for every university on this origin. */
    clearAll() {
      safe.keys().filter((k) => k && k.startsWith(PREFIX)).forEach((k) => safe.del(k));
    },
  };
  return api;
}
