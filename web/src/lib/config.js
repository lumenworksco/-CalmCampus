/** ?u=<id> wins, then the folder's <meta name="cc-university">, then "default". */
export function resolveUniversityId(search, metaValue) {
  const fromUrl = new URLSearchParams(search).get("u");
  const id = (fromUrl || metaValue || "default").toLowerCase();
  return /^[a-z0-9-]+$/.test(id) ? id : "default";
}

/** Load a university config; fall back to default if it is missing. */
export async function loadConfig(id, fetchFn = fetch) {
  const get = async (name) => {
    const res = await fetchFn(`config/universities/${name}.json`);
    if (!res.ok) throw new Error(`config ${name}: ${res.status}`);
    return res.json();
  };
  try { return { config: await get(id), fellBack: false }; }
  catch (err) {
    if (id === "default") throw err;
    return { config: await get("default"), fellBack: true };
  }
}

/**
 * Some configs serve students from several universities (for example a student app
 * used across a region): `institutions` lists each one with its own services, levels
 * and campus numbers. The student picks one once; the app then runs on the merged
 * config below. A config without `institutions` is used as it is.
 */
export const institutionsOf = (config) => (Array.isArray(config?.institutions) ? config.institutions : []);

export function institutionConfig(config, instId) {
  const inst = institutionsOf(config).find((i) => i.id === instId);
  if (!inst) return config;
  return {
    ...config,
    name: inst.name ?? config.name,
    nameInText: inst.nameInText ?? inst.name ?? config.nameInText,
    services: inst.services ?? {},
    levels: inst.levels ?? config.levels,
    // The institution's own campus numbers first, then the ones that apply to everyone.
    emergency: [...(inst.emergency ?? []), ...(config.emergency ?? [])],
    advice: inst.advice ?? null,
    institution: inst.id,
  };
}
