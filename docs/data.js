'use strict';
// Data layer: the browser talks to Supabase directly (schema in supabase/schema.sql).
// Every row has a user_id; row-level security only lets the signed-in user see and change their own rows.

function createDb(sb) {
  const ms = (t) => (t ? Date.parse(t) : null);
  const toReview = (r) => ({
    due: ms(r.due), interval: r.interval_days, ease: r.ease, reps: r.reps, lapses: r.lapses, createdAt: ms(r.created_at),
  });
  const toCard = (r) => ({
    id: r.id, folderId: r.folder_id, ko: r.ko, rom: r.rom, tr: r.tr, ex: r.ex, note: r.note,
    good: r.good, bad: r.bad, box: r.box, last: ms(r.last_seen),
    // Spaced repetition per direction: rec = Korean -> meaning, pro = meaning -> Korean. Missing = never reviewed.
    reviews: Object.fromEntries((r.reviews || []).map((v) => [v.dir, toReview(v)])),
  });
  const toSession = (r) => ({ at: ms(r.at), mode: r.mode, total: r.total, good: r.good, bad: r.bad });
  const toFolder = (r) => ({
    id: r.id,
    name: r.name,
    createdAt: ms(r.created_at),
    cards: (r.cards || []).map(toCard),
    sessions: (r.sessions || []).map(toSession).reverse(), // fetched newest first, app wants oldest first
  });

  function check({ data, error }) {
    if (!error) return data;
    if (error.code === '23505') throw new Error('That word is already in this folder');
    throw new Error(error.message || 'Database error');
  }

  const clean = (v, max) => String(v ?? '').trim().slice(0, max);

  function cleanCards(list) {
    const seen = new Set();
    const out = [];
    for (const raw of list || []) {
      const c = { ko: clean(raw.ko, 200), rom: clean(raw.rom, 200), tr: clean(raw.tr, 300), ex: clean(raw.ex, 300) };
      const key = c.ko + '\u0000' + c.tr;
      if (!c.ko || !c.tr || seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }

  // Words already in the folder are skipped (unique folder_id + ko + tr); only inserted rows come back.
  async function insertCards(folderId, cards) {
    const rows = cleanCards(cards).map((c) => ({ folder_id: folderId, ...c }));
    if (!rows.length) return 0;
    const data = check(await sb.from('cards').upsert(rows, { onConflict: 'folder_id,ko,tr', ignoreDuplicates: true }).select('id'));
    return data.length;
  }

  return {
    auth: sb.auth,

    async listFolders() {
      const rows = check(
        await sb
          .from('folders')
          .select(
            'id,name,created_at,' +
              'cards(id,folder_id,ko,rom,tr,ex,note,good,bad,box,last_seen,reviews(dir,due,interval_days,ease,reps,lapses,created_at)),' +
              'sessions(at,mode,total,good,bad)'
          )
          .order('created_at')
          .order('seq', { referencedTable: 'cards' })
          .order('at', { referencedTable: 'sessions', ascending: false })
          .limit(500, { referencedTable: 'sessions' })
      );
      return rows.map(toFolder);
    },

    async createFolder(name, cards) {
      const folder = check(await sb.from('folders').insert({ name: clean(name, 80) }).select('id').single());
      return { id: folder.id, added: await insertCards(folder.id, cards) };
    },

    async addCards(folderId, cards) {
      return { added: await insertCards(folderId, cards) };
    },

    async renameFolder(id, name) {
      check(await sb.from('folders').update({ name: clean(name, 80) }).eq('id', id));
    },

    async deleteFolder(id) {
      check(await sb.from('folders').delete().eq('id', id));
    },

    async resetFolder(id) {
      check(await sb.from('cards').update({ good: 0, bad: 0, box: 0, last_seen: null }).eq('folder_id', id));
      check(await sb.from('sessions').delete().eq('folder_id', id));
    },

    async updateCard(cardId, fields) {
      const c = {
        ko: clean(fields.ko, 200), rom: clean(fields.rom, 200), tr: clean(fields.tr, 300),
        ex: clean(fields.ex, 300), note: clean(fields.note, 300),
      };
      if (!c.ko || !c.tr) throw new Error('Korean word and translation are required');
      check(await sb.from('cards').update(c).eq('id', cardId));
    },

    async deleteCard(cardId) {
      check(await sb.from('cards').delete().eq('id', cardId));
    },

    // Atomic in the database: correct moves the Leitner box up (max 5), wrong drops it to 0.
    // `day` is the local date (YYYY-MM-DD); it also counts the answer toward that day's goal.
    async answer(folderId, cardId, good, day) {
      check(await sb.rpc('record_answer', { p_folder: folderId, p_card: cardId, p_good: !!good, p_day: day }));
    },

    // Spaced repetition grade (1 again, 2 hard, 3 good, 4 easy); the database computes the next due date.
    async recordReview(cardId, dir, grade, day) {
      return toReview(check(await sb.rpc('record_review', { p_card: cardId, p_dir: dir, p_grade: grade, p_day: day })));
    },

    // Answers per local day, for the daily goal and streak: Map 'YYYY-MM-DD' -> count.
    async activity() {
      const rows = check(await sb.from('activity').select('day,answers').order('day', { ascending: false }).limit(400));
      return new Map(rows.map((r) => [r.day, r.answers]));
    },

    async logActivity(day, count) {
      check(await sb.rpc('log_activity', { p_day: day, p_count: count }));
    },

    async addSession(folderId, session) {
      check(await sb.from('sessions').insert({ folder_id: folderId, ...session }));
    },
  };
}

if (typeof module !== 'undefined') module.exports = createDb;
