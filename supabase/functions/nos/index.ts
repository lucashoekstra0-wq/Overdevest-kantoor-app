// Supabase Edge Function "nos": haalt de laatste NOS-koppen op uit de openbare RSS-feed.
// Deploy: Supabase > Edge Functions > Deploy a new function > Via Editor, naam "nos", plak deze code.

const FEED = 'https://feeds.nos.nl/nosnieuwsalgemeen';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let cache: { at: number; items: unknown[] } | null = null;

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (!cache || Date.now() - cache.at > 5 * 60 * 1000) {
    try {
      const xml = await (await fetch(FEED, { headers: { 'User-Agent': 'Overdevest-TV/1.0' } })).text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).map(([, it]) => ({
        title: decode(it.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''),
        date: new Date(decode(it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '')).toISOString(),
        link: decode(it.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? ''),
      })).filter((i) => i.title);
      cache = { at: Date.now(), items };
    } catch (_e) {
      if (!cache) cache = { at: 0, items: [] };
    }
  }

  return new Response(JSON.stringify(cache.items), {
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
});
