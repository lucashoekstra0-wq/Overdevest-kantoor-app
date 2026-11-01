import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const configured = !SUPABASE_URL.includes('JOUW-PROJECT');

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// Gooi een duidelijke foutmelding als Supabase een fout teruggeeft
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(friendly(error.message));
  return data;
}

function friendly(msg = '') {
  if (msg.includes('geen_dubbele_boeking')) return 'Deze ruimte is op dat moment al gereserveerd.';
  if (msg.includes('row-level security')) return 'Dit mag niet (meer). Is de sluitingstijd misschien verstreken?';
  if (msg.includes('nominations_check')) return 'Je kunt jezelf niet nomineren.';
  if (msg.includes('duplicate key')) return 'Dit heb je al gedaan.';
  return msg;
}

// Cache van alle collega's (id -> profiel)
let people = null;
export async function loadPeople(force = false) {
  if (people && !force) return people;
  const rows = await q(sb.from('profiles').select('id, full_name, email, is_admin, active, in_roulette, show_birthday').order('full_name'));
  people = Object.fromEntries(rows.map(p => [p.id, p]));
  return people;
}
export function personName(id) {
  return people?.[id]?.full_name || 'Onbekend';
}

// Getekende links voor privé-foto's
const urlCache = new Map();
export async function photoUrls(paths) {
  const need = [...new Set(paths.filter(p => p && !urlCache.has(p)))];
  if (need.length) {
    const { data } = await sb.storage.from('photos').createSignedUrls(need, 60 * 60 * 6);
    (data || []).forEach(d => d.signedUrl && urlCache.set(d.path, d.signedUrl));
  }
  return Object.fromEntries(paths.filter(Boolean).map(p => [p, urlCache.get(p)]));
}

export async function uploadPhoto(file, folder = 'posts') {
  const small = await shrinkImage(file, 1600);
  const path = `${folder}/${crypto.randomUUID()}.jpg`;
  await q(sb.storage.from('photos').upload(path, small, { contentType: 'image/jpeg' }));
  return path;
}

export async function uploadPublic(file) {
  const small = await shrinkImage(file, 1600);
  const path = `social/${crypto.randomUUID()}.jpg`;
  await q(sb.storage.from('public-media').upload(path, small, { contentType: 'image/jpeg' }));
  return sb.storage.from('public-media').getPublicUrl(path).data.publicUrl;
}

// Foto's verkleinen voor upload (sneller en minder opslag)
function shrinkImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Foto kon niet worden verwerkt')), 'image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Dit bestand is geen foto'));
    img.src = URL.createObjectURL(file);
  });
}
