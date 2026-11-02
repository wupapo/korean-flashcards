'use strict';
// One-time move of data/db.json (local storage) into Supabase, keeping ids, stats and session history.
// Run: npm run import   (needs SUPABASE_URL + SUPABASE_SECRET_KEY in .env). Folders already in Supabase are skipped.

const fs = require('fs');
const path = require('path');
const supabaseStore = require('../store/supabase');

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env first.');
  process.exit(1);
}

const file = process.argv[2] || path.join(__dirname, '..', 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(file, 'utf8'));
const { rest } = supabaseStore(SUPABASE_URL, SUPABASE_SECRET_KEY);
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

(async () => {
  for (const f of db.folders) {
    const existing = await rest(`/folders?id=eq.${encodeURIComponent(f.id)}&select=id`);
    if (existing.length) {
      console.log(`skip   ${f.name} (already in Supabase)`);
      continue;
    }
    await rest('/folders', { method: 'POST', body: { id: f.id, name: f.name, created_at: iso(f.createdAt) } });
    if (f.cards.length) {
      await rest('/cards?on_conflict=folder_id,ko,tr', {
        method: 'POST',
        prefer: 'resolution=ignore-duplicates',
        body: f.cards.map((c) => ({
          id: c.id, folder_id: f.id, ko: c.ko, rom: c.rom || '', tr: c.tr,
          good: c.good, bad: c.bad, box: c.box, last_seen: iso(c.last),
        })),
      });
    }
    if (f.sessions.length) {
      await rest('/sessions', {
        method: 'POST',
        body: f.sessions.map((s) => ({
          folder_id: f.id, at: iso(s.at), mode: s.mode || 'cards', total: s.total, good: s.good, bad: s.bad,
        })),
      });
    }
    console.log(`import ${f.name}: ${f.cards.length} words, ${f.sessions.length} sessions`);
  }
})().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
