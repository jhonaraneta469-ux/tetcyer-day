/* ═══════════════════════════════════════════════════════════
   geo.js — visitor IP + location personalization.
   Fallback chain: ipwho.is → geojs.io → ipapi.co → graceful text.
   All APIs verified live 2026-09-05.
   ═══════════════════════════════════════════════════════════ */
const PROVIDERS = [
  {
    name: 'ipwho.is',
    url: 'https://ipwho.is/',
    parse: (d) => d && d.success !== false && d.city ? {
      ip: d.ip, city: d.city, region: d.region, country: d.country,
      flag: d.flag?.emoji || '🌍', timezone: d.timezone?.id || null,
    } : null,
  },
  {
    name: 'geojs.io',
    url: 'https://get.geojs.io/v1/ip/geo.json',
    parse: (d) => d && d.city ? {
      ip: d.ip, city: d.city, region: d.region, country: d.country,
      flag: '🌍', timezone: d.timezone || null,
    } : null,
  },
  {
    name: 'ipapi.co',
    url: 'https://ipapi.co/json/',
    parse: (d) => d && d.city && !d.error ? {
      ip: d.ip, city: d.city, region: d.region, country: d.country_name,
      flag: '🌍', timezone: d.timezone || null,
    } : null,
  },
];

export async function fetchGeo() {
  for (const p of PROVIDERS) {
    try {
      const res = await fetch(p.url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      const parsed = p.parse(data);
      if (parsed) return parsed;
    } catch (_) { /* try next provider */ }
  }
  return null;
}

/** Fire-and-forget: fetch geo, then invoke cb with result (or null). */
export function personalize(cb) {
  fetchGeo()
    .then((data) => cb(data))
    .catch(() => cb(null));
}
