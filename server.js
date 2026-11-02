'use strict';
// Tiny zero-dependency server: serves the web app and stores everything in data/db.json.
// Run: node server.js   (then open the printed URL on laptop or phone, same Wi-Fi)

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/* ---------- storage (replace this section to move to Supabase later) ---------- */

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { folders: [] };
  }
}

let db = loadDb();

function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic replace, so a crash never leaves a half-written file
}

const uid = () => crypto.randomUUID();

function cleanCard(c) {
  const s = (v, max) => String(v ?? '').trim().slice(0, max);
  const card = { ko: s(c?.ko, 200), rom: s(c?.rom, 200), tr: s(c?.tr, 300) };
  return card.ko && card.tr ? card : null;
}

function addCards(folder, list) {
  const key = (c) => c.ko + '\u0000' + c.tr;
  const seen = new Set(folder.cards.map(key));
  let added = 0;
  for (const raw of Array.isArray(list) ? list : []) {
    const c = cleanCard(raw);
    if (!c || seen.has(key(c))) continue;
    seen.add(key(c));
    folder.cards.push({ id: uid(), ...c, good: 0, bad: 0, box: 0, last: null });
    added++;
  }
  return added;
}

/* ---------- API ---------- */

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 5 * 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, parts) {
  const method = req.method;
  const body = ['POST', 'PATCH'].includes(method) ? await readJson(req) : {};
  const [resource, fid, sub, cid] = parts;
  if (resource !== 'folders') return send(res, 404, { error: 'Not found' });

  if (!fid) {
    if (method === 'GET') return send(res, 200, db.folders);
    if (method === 'POST') {
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) return send(res, 400, { error: 'Folder name is required' });
      const folder = { id: uid(), name, createdAt: Date.now(), cards: [], sessions: [] };
      const added = addCards(folder, body.cards);
      db.folders.push(folder);
      saveDb();
      return send(res, 201, { folder, added });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  const folder = db.folders.find((f) => f.id === fid);
  if (!folder) return send(res, 404, { error: 'Folder not found' });

  if (!sub) {
    if (method === 'PATCH') {
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) return send(res, 400, { error: 'Folder name is required' });
      folder.name = name;
      saveDb();
      return send(res, 200, folder);
    }
    if (method === 'DELETE') {
      db.folders = db.folders.filter((f) => f !== folder);
      saveDb();
      return send(res, 200, { ok: true });
    }
  }

  if (sub === 'cards' && !cid && method === 'POST') {
    const added = addCards(folder, body.cards);
    saveDb();
    return send(res, 200, { folder, added });
  }

  if (sub === 'cards' && cid) {
    const card = folder.cards.find((c) => c.id === cid);
    if (!card) return send(res, 404, { error: 'Word not found' });
    if (method === 'PATCH') {
      const c = cleanCard({ ...card, ...body });
      if (!c) return send(res, 400, { error: 'Korean word and translation are required' });
      Object.assign(card, c);
      saveDb();
      return send(res, 200, card);
    }
    if (method === 'DELETE') {
      folder.cards = folder.cards.filter((c) => c !== card);
      saveDb();
      return send(res, 200, { ok: true });
    }
  }

  // One practice answer. Leitner-style box: correct moves up a box, wrong drops to 0.
  if (sub === 'answer' && method === 'POST') {
    const card = folder.cards.find((c) => c.id === body.cardId);
    if (!card) return send(res, 404, { error: 'Word not found' });
    if (body.good) {
      card.good++;
      card.box = Math.min(5, card.box + 1);
    } else {
      card.bad++;
      card.box = 0;
    }
    card.last = Date.now();
    saveDb();
    return send(res, 200, card);
  }

  if (sub === 'sessions' && method === 'POST') {
    const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
    const mode = ['cards', 'match', 'test'].includes(body.mode) ? body.mode : 'cards';
    const session = { at: Date.now(), mode, total: n(body.total), good: n(body.good), bad: n(body.bad) };
    folder.sessions.push(session);
    folder.sessions = folder.sessions.slice(-500);
    saveDb();
    return send(res, 201, session);
  }

  if (sub === 'reset' && method === 'POST') {
    for (const c of folder.cards) Object.assign(c, { good: 0, bad: 0, box: 0, last: null });
    folder.sessions = [];
    saveDb();
    return send(res, 200, folder);
  }

  return send(res, 405, { error: 'Method not allowed' });
}

/* ---------- static files ---------- */

function serveStatic(req, res, pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'api') {
    try {
      await handleApi(req, res, parts.slice(1));
    } catch (err) {
      send(res, 400, { error: err.message || 'Bad request' });
    }
    return;
  }
  serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
  console.log('\n  Korean flashcards running');
  console.log(`  Laptop: http://localhost:${PORT}`);
  for (const u of lan) console.log(`  Phone:  ${u}   (same Wi-Fi)`);
  console.log(`  Data:   ${DB_FILE}\n`);
});
