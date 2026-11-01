import { sb, q } from '../sb.js';

let cache = null, cachedAt = 0;
export async function getSettings(force = false) {
  if (cache && !force && Date.now() - cachedAt < 60000) return cache;
  const rows = await q(sb.from('settings').select('key, value'));
  cache = Object.fromEntries(rows.map(r => [r.key, r.value]));
  cachedAt = Date.now();
  return cache;
}
