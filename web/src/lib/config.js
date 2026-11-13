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
