'use strict';
// Tiny zero-dependency server: serves the web app and a JSON API.
// Storage: Supabase when SUPABASE_URL + SUPABASE_SECRET_KEY are set (see .env.example), otherwise data/db.json.
// Run: npm start   (then open the printed URL on laptop or phone, same Wi-Fi)

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const jsonStore = require('./store/json');
const supabaseStore = require('./store/supabase');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const store =
  process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
    ? supabaseStore(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
    : jsonStore(path.join(__dirname, 'data', 'db.json'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/* ---------- input cleaning ---------- */

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const cleanName = (v) => str(v, 80);

function cleanCard(c) {
  const card = { ko: str(c?.ko, 200), rom: str(c?.rom, 200), tr: str(c?.tr, 300) };
  return card.ko && card.tr ? card : null;
}

function cleanCards(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list.slice(0, 5000) : []) {
    const c = cleanCard(raw);
    const key = c && c.ko + '\u0000' + c.tr;
    if (!c || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
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
        reject(Object.assign(new Error('Body too large'), { status: 400 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const NOT_FOLDER = { error: 'Folder not found' };
const NOT_WORD = { error: 'Word not found' };

async function handleApi(req, res, parts) {
  const method = req.method;
  const body = ['POST', 'PATCH'].includes(method) ? await readJson(req) : {};
  const [resource, fid, sub, cid] = parts;
  if (resource !== 'folders') return send(res, 404, { error: 'Not found' });

  if (!fid) {
    if (method === 'GET') return send(res, 200, await store.listFolders());
    if (method === 'POST') {
      const name = cleanName(body.name);
      if (!name) return send(res, 400, { error: 'Folder name is required' });
      return send(res, 201, await store.createFolder(name, cleanCards(body.cards)));
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (!sub) {
    if (method === 'PATCH') {
      const name = cleanName(body.name);
      if (!name) return send(res, 400, { error: 'Folder name is required' });
      const folder = await store.renameFolder(fid, name);
      return folder ? send(res, 200, folder) : send(res, 404, NOT_FOLDER);
    }
    if (method === 'DELETE') {
      return (await store.deleteFolder(fid)) ? send(res, 200, { ok: true }) : send(res, 404, NOT_FOLDER);
    }
  }

  if (sub === 'cards' && !cid && method === 'POST') {
    const r = await store.addCards(fid, cleanCards(body.cards));
    return r ? send(res, 200, r) : send(res, 404, NOT_FOLDER);
  }

  if (sub === 'cards' && cid) {
    if (method === 'PATCH') {
      const c = cleanCard(body);
      if (!c) return send(res, 400, { error: 'Korean word and translation are required' });
      const card = await store.updateCard(fid, cid, c);
      return card ? send(res, 200, card) : send(res, 404, NOT_WORD);
    }
    if (method === 'DELETE') {
      return (await store.deleteCard(fid, cid)) ? send(res, 200, { ok: true }) : send(res, 404, NOT_WORD);
    }
  }

  if (sub === 'answer' && method === 'POST') {
    const card = await store.answer(fid, String(body.cardId || ''), !!body.good);
    return card ? send(res, 200, card) : send(res, 404, NOT_WORD);
  }

  if (sub === 'sessions' && method === 'POST') {
    const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
    const mode = ['cards', 'match', 'test'].includes(body.mode) ? body.mode : 'cards';
    const session = await store.addSession(fid, { mode, total: n(body.total), good: n(body.good), bad: n(body.bad) });
    return session ? send(res, 201, session) : send(res, 404, NOT_FOLDER);
  }

  if (sub === 'reset' && method === 'POST') {
    return (await store.resetFolder(fid)) ? send(res, 200, { ok: true }) : send(res, 404, NOT_FOLDER);
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
      // Postgres codes from Supabase: 23505 duplicate word, 22P02 malformed id.
      if (err.code === '23505') return send(res, 409, { error: 'That word is already in this folder' });
      if (err.code === '22P02') return send(res, 404, { error: 'Not found' });
      if (err.status === 400) return send(res, 400, { error: err.message });
      console.error('Storage error:', err.code || '', err.message);
      send(res, 500, { error: 'Storage error: ' + err.message });
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
  console.log(`  Laptop:  http://localhost:${PORT}`);
  for (const u of lan) console.log(`  Phone:   ${u}   (same Wi-Fi)`);
  console.log(`  Storage: ${store.label}\n`);
});
