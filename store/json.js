'use strict';
// Local backend: everything in one JSON file. Used when Supabase isn't configured.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function jsonStore(file) {
  let db;
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    db = { folders: [] };
  }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file); // atomic replace, so a crash never leaves a half-written file
  }

  const findFolder = (id) => db.folders.find((f) => f.id === id);
  const findCard = (fid, cid) => findFolder(fid)?.cards.find((c) => c.id === cid);

  function addCards(folder, cards) {
    const key = (c) => c.ko + '\u0000' + c.tr;
    const seen = new Set(folder.cards.map(key));
    let added = 0;
    for (const c of cards) {
      if (seen.has(key(c))) continue;
      seen.add(key(c));
      folder.cards.push({ id: crypto.randomUUID(), ...c, good: 0, bad: 0, box: 0, last: null });
      added++;
    }
    return added;
  }

  return {
    label: `file ${file}`,

    async listFolders() {
      return db.folders;
    },

    async createFolder(name, cards) {
      const folder = { id: crypto.randomUUID(), name, createdAt: Date.now(), cards: [], sessions: [] };
      const added = addCards(folder, cards);
      db.folders.push(folder);
      save();
      return { folder, added };
    },

    async renameFolder(id, name) {
      const folder = findFolder(id);
      if (!folder) return null;
      folder.name = name;
      save();
      return folder;
    },

    async deleteFolder(id) {
      const folder = findFolder(id);
      if (!folder) return false;
      db.folders = db.folders.filter((f) => f !== folder);
      save();
      return true;
    },

    async addCards(id, cards) {
      const folder = findFolder(id);
      if (!folder) return null;
      const added = addCards(folder, cards);
      save();
      return { added };
    },

    async updateCard(fid, cid, fields) {
      const card = findCard(fid, cid);
      if (!card) return null;
      Object.assign(card, fields);
      save();
      return card;
    },

    async deleteCard(fid, cid) {
      const folder = findFolder(fid);
      const card = folder?.cards.find((c) => c.id === cid);
      if (!card) return false;
      folder.cards = folder.cards.filter((c) => c !== card);
      save();
      return true;
    },

    // Leitner box: correct moves up a box (max 5), wrong drops to 0.
    async answer(fid, cid, good) {
      const card = findCard(fid, cid);
      if (!card) return null;
      if (good) {
        card.good++;
        card.box = Math.min(5, card.box + 1);
      } else {
        card.bad++;
        card.box = 0;
      }
      card.last = Date.now();
      save();
      return card;
    },

    async addSession(fid, session) {
      const folder = findFolder(fid);
      if (!folder) return null;
      const s = { at: Date.now(), ...session };
      folder.sessions.push(s);
      folder.sessions = folder.sessions.slice(-500);
      save();
      return s;
    },

    async resetFolder(fid) {
      const folder = findFolder(fid);
      if (!folder) return false;
      for (const c of folder.cards) Object.assign(c, { good: 0, bad: 0, box: 0, last: null });
      folder.sessions = [];
      save();
      return true;
    },
  };
};
