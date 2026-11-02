'use strict';
// Supabase backend over its REST API (PostgREST). Uses the secret key, so it must only ever run on the server.
// Schema: tables folders / cards / sessions + function record_answer (see supabase/schema.sql).

module.exports = function supabaseStore(url, key) {
  const base = url.replace(/\/+$/, '') + '/rest/v1';

  async function rest(path, { method = 'GET', body, prefer } = {}) {
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(data?.message || `Supabase request failed (${res.status})`);
      err.code = data?.code; // Postgres error code, e.g. 23505 unique violation
      throw err;
    }
    return data;
  }

  const q = encodeURIComponent;
  const ms = (t) => (t ? Date.parse(t) : null);
  const toCard = (r) => ({ id: r.id, ko: r.ko, rom: r.rom, tr: r.tr, good: r.good, bad: r.bad, box: r.box, last: ms(r.last_seen) });
  const toSession = (r) => ({ at: ms(r.at), mode: r.mode, total: r.total, good: r.good, bad: r.bad });
  const toFolder = (r) => ({
    id: r.id,
    name: r.name,
    createdAt: ms(r.created_at),
    cards: (r.cards || []).map(toCard),
    sessions: (r.sessions || []).map(toSession).reverse(), // fetched newest first, app wants oldest first
  });

  const folderExists = async (id) => (await rest(`/folders?id=eq.${q(id)}&select=id`)).length > 0;

  async function insertCards(folderId, cards) {
    if (!cards.length) return 0;
    // Words already in the folder are skipped (unique folder_id + ko + tr); only inserted rows come back.
    const rows = await rest('/cards?on_conflict=folder_id,ko,tr&select=id', {
      method: 'POST',
      body: cards.map((c) => ({ folder_id: folderId, ko: c.ko, rom: c.rom, tr: c.tr })),
      prefer: 'resolution=ignore-duplicates,return=representation',
    });
    return rows.length;
  }

  return {
    label: `Supabase ${new URL(url).host}`,
    rest,

    async listFolders() {
      const rows = await rest(
        '/folders?select=id,name,created_at,' +
          'cards(id,ko,rom,tr,good,bad,box,last_seen),sessions(at,mode,total,good,bad)' +
          '&order=created_at.asc&cards.order=seq.asc&sessions.order=at.desc&sessions.limit=500'
      );
      return rows.map(toFolder);
    },

    async createFolder(name, cards) {
      const [row] = await rest('/folders', { method: 'POST', body: { name }, prefer: 'return=representation' });
      const added = await insertCards(row.id, cards);
      return { folder: toFolder(row), added };
    },

    async renameFolder(id, name) {
      const rows = await rest(`/folders?id=eq.${q(id)}`, { method: 'PATCH', body: { name }, prefer: 'return=representation' });
      return rows[0] ? toFolder(rows[0]) : null;
    },

    async deleteFolder(id) {
      const rows = await rest(`/folders?id=eq.${q(id)}&select=id`, { method: 'DELETE', prefer: 'return=representation' });
      return rows.length > 0;
    },

    async addCards(id, cards) {
      if (!(await folderExists(id))) return null;
      return { added: await insertCards(id, cards) };
    },

    async updateCard(fid, cid, fields) {
      const rows = await rest(`/cards?id=eq.${q(cid)}&folder_id=eq.${q(fid)}`, {
        method: 'PATCH',
        body: { ko: fields.ko, rom: fields.rom, tr: fields.tr },
        prefer: 'return=representation',
      });
      return rows[0] ? toCard(rows[0]) : null;
    },

    async deleteCard(fid, cid) {
      const rows = await rest(`/cards?id=eq.${q(cid)}&folder_id=eq.${q(fid)}&select=id`, { method: 'DELETE', prefer: 'return=representation' });
      return rows.length > 0;
    },

    async answer(fid, cid, good) {
      const row = await rest('/rpc/record_answer', { method: 'POST', body: { p_folder: fid, p_card: cid, p_good: !!good } });
      return row?.id ? toCard(row) : null;
    },

    async addSession(fid, session) {
      if (!(await folderExists(fid))) return null;
      const [row] = await rest('/sessions', { method: 'POST', body: { folder_id: fid, ...session }, prefer: 'return=representation' });
      return toSession(row);
    },

    async resetFolder(fid) {
      if (!(await folderExists(fid))) return false;
      await rest(`/cards?folder_id=eq.${q(fid)}`, { method: 'PATCH', body: { good: 0, bad: 0, box: 0, last_seen: null } });
      await rest(`/sessions?folder_id=eq.${q(fid)}`, { method: 'DELETE' });
      return true;
    },
  };
};
