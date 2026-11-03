'use strict';

const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');
const $toast = document.getElementById('toast');

const MASTER_BOX = 3; // a word counts as mastered after 3 correct answers in a row
const state = { user: null, folders: [], practice: null, game: null, review: null };

/* ---------- helpers ---------- */

const HANGUL = /[가-힣ㄱ-ㆎ]/;
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICONS = {
  upload: '<path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  sound: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5"/>',
  arrow: '<path d="M5 12h14m-5-5l5 5-5 5"/>',
  play: '<path d="M8 5.5v13l10-6.5-10-6.5z"/>',
  redo: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  signout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
};
const icon = (n) =>
  `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

const db = createDb(supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY));

function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $toast.classList.remove('show'), 2400);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PREF_DEFAULTS = {
  mode: 'cards', dir: 'ko', set: 'all', count: '20', repeat: true, qtype: 'mc', feedback: 'now',
  wdir: 'mix', // write mode: type Korean / translation / mixed
  rnew: '10', rdir: 'both', // review: new words per day, directions
};
function prefs() {
  try {
    return { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem('practicePrefs') || '{}') };
  } catch {
    return { ...PREF_DEFAULTS };
  }
}
function setPref(key, val) {
  try {
    localStorage.setItem('practicePrefs', JSON.stringify({ ...prefs(), [key]: val }));
  } catch {}
}

function go(path) {
  if (location.hash === '#' + path) route();
  else location.hash = path;
}

const getFolder = (id) => state.folders.find((f) => f.id === id);
const getCard = (fid, cid) => getFolder(fid)?.cards.find((c) => c.id === cid);

async function loadFolders() {
  state.folders = await db.listFolders();
}

/* ---------- stats ---------- */

const cardStatus = (c) => (!c.good && !c.bad ? 'new' : c.box >= MASTER_BOX ? 'mastered' : 'learning');
const STATUS_LABEL = { new: 'New', learning: 'Learning', mastered: 'Mastered' };

function folderStats(f) {
  const s = { total: f.cards.length, new: 0, learning: 0, mastered: 0, good: 0, bad: 0 };
  for (const c of f.cards) {
    s[cardStatus(c)]++;
    s.good += c.good;
    s.bad += c.bad;
  }
  s.accuracy = s.good + s.bad ? Math.round((s.good / (s.good + s.bad)) * 100) : null;
  s.last = f.sessions.length ? f.sessions[f.sessions.length - 1].at : null;
  s.sessions = f.sessions.length;
  return s;
}

const dayKey = (t) => new Date(t).toDateString();
function streak() {
  const days = new Set();
  for (const f of state.folders) for (const s of f.sessions) days.add(dayKey(s.at));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // streak survives until the end of today
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function ago(t) {
  if (!t) return 'Not practiced yet';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'Practiced just now';
  if (min < 60) return `Practiced ${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `Practiced ${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Practiced yesterday' : `Practiced ${d} days ago`;
}

function progressBar(s) {
  const pct = (n) => (s.total ? (n / s.total) * 100 : 0);
  return `<div class="pbar" role="img" aria-label="${s.mastered} mastered, ${s.learning} learning, ${s.new} new">
    <i class="m" style="width:${pct(s.mastered)}%"></i><i class="l" style="width:${pct(s.learning)}%"></i></div>`;
}

// Which direction a word needs more: 'pro' (meaning -> Korean) or 'rec' (Korean -> meaning).
// Uses the review schedule (shorter interval = weaker; never reviewed = weakest), else leans to the harder 'pro'.
// Picks the weaker side 3 times out of 4 so the other direction still comes up.
function weakerDir(card) {
  const rec = card.reviews?.rec;
  const pro = card.reviews?.pro;
  const a = rec ? rec.interval : -1;
  const b = pro ? pro.interval : -1;
  if ((rec || pro) && a !== b) {
    const weaker = b < a ? 'pro' : 'rec';
    return Math.random() < 0.75 ? weaker : weaker === 'pro' ? 'rec' : 'pro';
  }
  return Math.random() < 0.6 ? 'pro' : 'rec';
}

// Words remembered for a week or longer, per direction.
function directionBars(f) {
  const total = f.cards.length || 1;
  const row = (dir) => {
    const n = f.cards.filter((c) => (c.reviews[dir]?.interval || 0) >= 7).length;
    return `<div class="dir-row"><span>${DIR_LABEL[dir]}</span>
      <div class="pbar thin"><i class="m" style="width:${(n / total) * 100}%"></i></div><b>${n}</b></div>`;
  };
  return `<div class="dir-bars" title="Words you remember for 7+ days">${row('rec')}${row('pro')}
    <p class="muted small">Remembered 7+ days · Recognize: Korean → meaning · Produce: meaning → Korean</p></div>`;
}

function reviewStatus(r) {
  if (!r) return 'not started';
  const days = Math.round((r.due - Date.now()) / DAY);
  return days <= 0 ? 'due now' : days === 1 ? 'next tomorrow' : `next in ${days} days`;
}

/* ---------- parsing uploaded text ---------- */

// Tried in order. Index matters: for these separators a 3rd column is read as the romanization.
const SEPARATORS = [/\t+/, /\s*\|\s*/, /\s+[-–—]\s+/, /\s*;\s*/, /\s*=\s*/, /\s*:\s*/, /\s*,\s*/, /\s*[-–—]\s*/];
const THREE_COLUMN_SEPS = new Set([0, 1, 2, 3]);

function parseLine(raw) {
  const line = raw.replace(/^﻿/, '').replace(/^\s*(\d+[.)]\s+|[-*•]\s+)/, '').trim();
  if (!HANGUL.test(line)) return null;

  // 사과 (sagwa) - olma
  const m = line.match(/^([^()[\]a-zA-Z]+?)\s*[([]\s*([^)\]]+?)\s*[)\]]\s*(?:[-–—:=|,;\t]\s*)?(.+)$/);
  if (m && HANGUL.test(m[1]) && !HANGUL.test(m[2]) && !HANGUL.test(m[3])) {
    return { ko: m[1].trim(), rom: m[2].trim(), tr: m[3].trim() };
  }

  for (let i = 0; i < SEPARATORS.length; i++) {
    const parts = line.split(SEPARATORS[i]).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2 || parts.filter((p) => HANGUL.test(p)).length !== 1) continue;
    const ki = parts.findIndex((p) => HANGUL.test(p));
    const rest = parts.filter((_, j) => j !== ki);
    let ko = parts[ki];
    let rom = '';
    const inner = ko.match(/^(.+?)\s*[([]\s*([^)\]]+?)\s*[)\]]$/);
    if (inner && !HANGUL.test(inner[2])) [ko, rom] = [inner[1], inner[2]];
    else if (ki === 0 && rest.length >= 2 && THREE_COLUMN_SEPS.has(i)) rom = rest.shift();
    return { ko, rom, tr: rest.join(', ') };
  }
  return null;
}

function parseText(text) {
  const cards = [];
  const skipped = [];
  const seen = new Set();
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('//')) return;
    const c = parseLine(t);
    if (!c) return skipped.push({ n: i + 1, line: t });
    const key = c.ko + '\u0000' + c.tr;
    if (seen.has(key)) return;
    seen.add(key);
    if (!c.rom) {
      c.rom = romanize(c.ko);
      c.auto = true;
    }
    cards.push(c);
  });
  return { cards, skipped };
}

// UTF-8 by default; handles UTF-16 (Windows "Unicode") and EUC-KR files too.
async function readTextFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('euc-kr').decode(buf);
  }
}

/* ---------- modal ---------- */

function showModal(html) {
  $modal.innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const overlay = $modal.firstElementChild;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  requestAnimationFrame(() => overlay.classList.add('open'));
  return overlay.querySelector('.sheet');
}

function closeModal() {
  $modal.innerHTML = '';
}

function confirmDialog({ title, text, ok = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const sheet = showModal(`<h2 class="modal-title">${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="modal-actions"><button class="btn" id="c-no">Cancel</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="c-yes">${esc(ok)}</button></div>`);
    sheet.querySelector('#c-no').onclick = () => (closeModal(), resolve(false));
    sheet.querySelector('#c-yes').onclick = () => (closeModal(), resolve(true));
  });
}

function promptDialog({ title, value = '', ok = 'Save' }) {
  return new Promise((resolve) => {
    const sheet = showModal(`<h2 class="modal-title">${esc(title)}</h2>
      <form id="p-form"><div class="field"><input id="p-val" maxlength="80" value="${esc(value)}" required></div>
      <div class="modal-actions"><button type="button" class="btn" id="p-no">Cancel</button>
      <button class="btn btn-primary">${esc(ok)}</button></div></form>`);
    const input = sheet.querySelector('#p-val');
    input.focus();
    input.select();
    sheet.querySelector('#p-no').onclick = () => (closeModal(), resolve(null));
    sheet.querySelector('#p-form').onsubmit = (e) => {
      e.preventDefault();
      closeModal();
      resolve(input.value.trim() || null);
    };
  });
}

/* ---------- home ---------- */

function renderHome() {
  document.title = '단어 · Flashcards';
  const words = state.folders.reduce((n, f) => n + f.cards.length, 0);
  const mastered = state.folders.reduce((n, f) => n + folderStats(f).mastered, 0);
  $app.innerHTML = `
    <header class="topbar"><div class="topbar-in">
      <div class="brand"><span class="brand-mark" lang="ko">단어</span><span class="brand-sub">Flashcards</span></div>
      <button class="icon-btn" data-act="signout" aria-label="Sign out" title="Sign out">${icon('signout')}</button>
      <button class="btn btn-primary" data-act="upload">${icon('upload')}<span>Upload words</span></button>
    </div></header>
    <main class="wrap">
      ${
        state.folders.length
          ? `<section class="summary">
              <div><b>${words}</b><span>words</span></div>
              <div><b>${mastered}</b><span>mastered</span></div>
              <div><b>${streak()}</b><span>day streak</span></div>
            </section>
            ${reviewPanel('all')}
            <h2 class="section-title">Folders</h2>
            <ul class="folder-grid">${state.folders.map(folderTile).join('')}</ul>`
          : `<section class="empty">
              <div class="empty-mark" lang="ko">가</div>
              <h2>No folders yet</h2>
              <p class="muted">Upload a .txt file with one word per line. Each file becomes a folder you can practice on its own.</p>
              <p class="hint"><code>사과 (sagwa) - olma</code></p>
              <button class="btn btn-primary btn-lg" data-act="upload">${icon('upload')} Upload words</button>
            </section>`
      }
    </main>`;
}

function folderTile(f) {
  const s = folderStats(f);
  return `<li class="folder">
    <a class="tile" href="#/folder/${f.id}">
      <h3>${esc(f.name)}</h3>
      <p class="meta">${s.total} words · ${s.mastered} mastered</p>
      ${progressBar(s)}
      <p class="last">${ago(s.last)}</p>
    </a>
    <button class="btn btn-sm btn-primary quick" data-act="quick" data-id="${f.id}" ${s.total ? '' : 'disabled'}>${icon('play')} Practice</button>
  </li>`;
}

/* ---------- upload ---------- */

function openUpload(presetFolderId = '') {
  let parsed = { cards: [], skipped: [] };
  const sheet = showModal(`
    <h2 class="modal-title">Upload words</h2>
    <label class="drop" id="drop">
      <input type="file" id="file" accept=".txt,.csv,.tsv,text/plain">
      ${icon('file')}<b id="drop-label">Choose a .txt file</b><span class="muted small">or drag it here</span>
    </label>
    <details class="paste"><summary>Paste text instead</summary>
      <textarea id="paste" rows="5" placeholder="사과 (sagwa) - olma&#10;학교 - maktab"></textarea></details>
    <p class="hint">One word per line, like <code>사과 (sagwa) - olma</code>. The reading is optional and is filled in automatically when missing.</p>
    <div id="preview"></div>
    <div class="field-row">
      <label class="field"><span>Save to</span>
        <select id="target"><option value="">+ New folder</option>
          ${state.folders.map((f) => `<option value="${f.id}" ${f.id === presetFolderId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
        </select></label>
      <label class="field" id="name-field"><span>Folder name</span><input id="fname" maxlength="80" placeholder="e.g. Lesson 1"></label>
    </div>
    <div class="modal-actions"><button class="btn" data-act="close">Cancel</button>
      <button class="btn btn-primary" id="save" disabled>Save words</button></div>`);

  const $ = (sel) => sheet.querySelector(sel);
  const target = $('#target');
  const fname = $('#fname');
  const save = $('#save');

  const refresh = () => {
    $('#name-field').hidden = !!target.value;
    save.disabled = !parsed.cards.length || (!target.value && !fname.value.trim());
    save.textContent = parsed.cards.length ? `Save ${parsed.cards.length} words` : 'Save words';
  };

  const renderPreview = () => {
    const { cards, skipped } = parsed;
    $('#preview').innerHTML =
      cards.length || skipped.length
        ? `<div class="preview">
          <div class="preview-head"><b>${cards.length} words found</b>${skipped.length ? ` · <span class="warn-text">${skipped.length} lines not recognised</span>` : ''}</div>
          <ul class="preview-list">${cards
            .map(
              (c, i) => `<li><span lang="ko"><b>${esc(c.ko)}</b><span class="rom">${esc(c.rom)}${c.auto ? ' <em>auto</em>' : ''}</span></span>
                <span>${esc(c.tr)}</span>
                <button class="x-btn" data-i="${i}" aria-label="Remove ${esc(c.ko)}">${icon('close')}</button></li>`
            )
            .join('')}</ul>
          ${skipped.length ? `<details class="skipped"><summary>Show lines not recognised</summary><ul>${skipped.map((s) => `<li>Line ${s.n}: ${esc(s.line)}</li>`).join('')}</ul></details>` : ''}
        </div>`
        : '';
    refresh();
  };

  const useText = (text, fileName) => {
    parsed = parseText(text);
    if (fileName && !fname.value.trim()) fname.value = fileName.replace(/\.[^.]+$/, '');
    renderPreview();
  };

  const useFile = async (file) => {
    if (!file) return;
    $('#drop-label').textContent = file.name;
    $('#drop').classList.add('has-file');
    useText(await readTextFile(file), file.name);
  };

  $('#file').onchange = (e) => useFile(e.target.files[0]);
  const drop = $('#drop');
  drop.ondragover = (e) => (e.preventDefault(), drop.classList.add('over'));
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    useFile(e.dataTransfer.files[0]);
  };
  $('#paste').oninput = (e) => useText(e.target.value);
  $('#preview').onclick = (e) => {
    const b = e.target.closest('.x-btn');
    if (!b) return;
    parsed.cards.splice(+b.dataset.i, 1);
    renderPreview();
  };
  target.onchange = refresh;
  fname.oninput = refresh;
  refresh();

  save.onclick = async () => {
    save.disabled = true;
    const body = { cards: parsed.cards.map(({ ko, rom, tr }) => ({ ko, rom, tr })) };
    try {
      let fid, added;
      if (target.value) {
        ({ added } = await db.addCards(target.value, body.cards));
        fid = target.value;
      } else {
        ({ id: fid, added } = await db.createFolder(fname.value.trim(), body.cards));
      }
      await loadFolders();
      closeModal();
      const dupes = body.cards.length - added;
      toast(`${added} words saved${dupes ? ` · ${dupes} already in folder` : ''}`);
      go('/folder/' + fid);
    } catch (err) {
      toast(err.message);
      refresh();
    }
  };
}

/* ---------- folder ---------- */

function poolFor(f, set) {
  if (set === 'unmastered') return f.cards.filter((c) => c.box < MASTER_BOX);
  if (set === 'mistakes') return f.cards.filter((c) => c.bad > 0 && c.box < MASTER_BOX);
  return f.cards;
}

function seg(pref, label, options, current) {
  return `<div class="seg-group"><span class="seg-label">${label}</span>
    <div class="seg" role="radiogroup" aria-label="${label}">${options
      .map(
        ([val, text, sub]) =>
          `<button role="radio" aria-checked="${val === current}" data-act="seg" data-pref="${pref}" data-val="${val}">
            <span>${text}</span>${sub != null ? `<small>${sub}</small>` : ''}</button>`
      )
      .join('')}</div></div>`;
}

function wordRows(cards) {
  return cards
    .map((c) => {
      const st = cardStatus(c);
      return `<li><button class="word" data-act="edit-word" data-id="${c.id}">
        <i class="dot ${st}" title="${STATUS_LABEL[st]}"></i>
        <span class="word-ko" lang="ko"><b>${esc(c.ko)}</b><span class="rom">${esc(c.rom)}</span></span>
        <span class="word-tr">${esc(c.tr)}</span></button></li>`;
    })
    .join('');
}

function renderFolder(id) {
  const f = getFolder(id);
  if (!f) return go('/');
  const s = folderStats(f);
  const p = prefs();
  document.title = `${f.name} · 단어`;
  $app.innerHTML = `
    <header class="topbar"><div class="topbar-in">
      <a class="icon-btn" href="#/" aria-label="Back to folders">${icon('back')}</a>
      <h1 class="topbar-title">${esc(f.name)}</h1>
      <button class="icon-btn" data-act="folder-menu" data-id="${f.id}" aria-label="Folder options">${icon('more')}</button>
    </div></header>
    <main class="wrap folder-page">
      <div class="col-left">
        <section class="panel">
          <div class="stats-grid">
            <div class="stat"><b>${s.total}</b><span>Words</span></div>
            <div class="stat good"><b>${s.mastered}</b><span>Mastered</span></div>
            <div class="stat warn"><b>${s.learning}</b><span>Learning</span></div>
            <div class="stat"><b>${s.new}</b><span>New</span></div>
          </div>
          ${progressBar(s)}
          <div class="stats-meta">
            <span>Accuracy <b>${s.accuracy == null ? '—' : s.accuracy + '%'}</b></span>
            <span>Sessions <b>${s.sessions}</b></span>
            <span>${ago(s.last)}</span>
          </div>
          ${directionBars(f)}
        </section>
        ${reviewPanel(f.id)}
        <section class="panel">
          <h2 class="panel-title">Practice</h2>
          <div class="mode-tabs">${seg('mode', 'Mode', [['cards', 'Flashcards'], ['match', 'Match'], ['test', 'Test'], ['write', 'Write']], p.mode)}</div>
          <div id="practice-opts">${practiceOptions(f, p)}</div>
          <button class="btn btn-primary btn-lg btn-block" data-act="start" data-id="${f.id}" id="start-btn"></button>
        </section>
      </div>
      <section class="panel">
        <div class="list-head"><h2 class="panel-title">Words</h2>
          <button class="btn btn-sm" data-act="upload" data-id="${f.id}">${icon('plus')} Add words</button></div>
        ${f.cards.length > 8 ? `<div class="search">${icon('search')}<input id="q" type="search" placeholder="Search words" autocomplete="off"></div>` : ''}
        <ul class="word-list" id="words">${f.cards.length ? wordRows(f.cards) : '<li class="muted empty-list">No words yet.</li>'}</ul>
      </section>
    </main>`;

  updateStartButton(f);
  const q = document.getElementById('q');
  if (q)
    q.oninput = () => {
      const t = q.value.trim().toLowerCase();
      const hits = f.cards.filter((c) => !t || [c.ko, c.rom, c.tr].some((v) => v.toLowerCase().includes(t)));
      document.getElementById('words').innerHTML = hits.length ? wordRows(hits) : '<li class="muted empty-list">No matches.</li>';
    };
}

function practiceOptions(f, p) {
  const which = seg('set', 'Which words', [
    ['all', 'All', f.cards.length],
    ['unmastered', 'To learn', poolFor(f, 'unmastered').length],
    ['mistakes', 'Mistakes', poolFor(f, 'mistakes').length],
  ], p.set);
  const count = seg('count', 'How many', [['10', '10'], ['20', '20'], ['all', 'All']], p.count);
  if (p.mode === 'match') {
    return `${which}${count}<p class="opt-note">Tap a Korean word, then its translation. Correct pairs disappear, wrong pairs flash red.</p>`;
  }
  if (p.mode === 'write') {
    return `${seg('wdir', 'Type in', [['ko', 'Korean'], ['tr', 'Translation'], ['mix', 'Mixed']], p.wdir)}
      ${which}${count}
      <p class="opt-note">Type the answer yourself. Small typos still count. Mixed asks more often in the direction you're weaker at.</p>`;
  }
  if (p.mode === 'test') {
    return `${seg('qtype', 'Question type', [['mc', 'Multiple choice'], ['tf', 'True / False'], ['mix', 'Mixed']], p.qtype)}
      ${seg('dir', 'Ask in', [['ko', 'Korean'], ['tr', 'Translation'], ['mix', 'Mixed']], p.dir)}
      ${which}${count}
      ${seg('feedback', 'Show correct answers', [['now', 'Right away'], ['end', 'At the end']], p.feedback)}`;
  }
  return `${seg('dir', 'Show first', [['ko', 'Korean'], ['tr', 'Translation'], ['mix', 'Mixed']], p.dir)}
    ${which}${count}
    <label class="switch"><input type="checkbox" id="repeat" ${p.repeat ? 'checked' : ''}><span class="track"></span>
      <span>Show missed words again in the same session</span></label>`;
}

function updateStartButton(f) {
  const btn = document.getElementById('start-btn');
  if (!btn) return;
  const p = prefs();
  const pool = poolFor(f, p.set).length;
  const n = p.count === 'all' ? pool : Math.min(+p.count, pool);
  const [min, label] =
    p.mode === 'match' ? [2, `Start match · ${n} words`]
    : p.mode === 'test' ? [1, `Start test · ${n} questions`]
    : p.mode === 'write' ? [1, `Start writing · ${n} words`]
    : [1, `Start · ${n} cards`];
  const tooFew = p.mode === 'test' && f.cards.length < 2;
  btn.disabled = n < min || tooFew;
  btn.innerHTML = !btn.disabled ? `${icon('play')} ${label}` : n && n < min || tooFew ? 'Needs at least 2 words' : 'No words in this set';
}

function startSelected(folderId, p) {
  if (p.mode === 'match') return startMatch(folderId, p);
  if (p.mode === 'test') return startTest(folderId, p);
  if (p.mode === 'write') return startWrite(folderId, p);
  return startPractice(folderId, p);
}

function openFolderMenu(fid) {
  const f = getFolder(fid);
  const sheet = showModal(`<h2 class="modal-title">${esc(f.name)}</h2>
    <div class="menu-list">
      <button data-m="rename">${icon('edit')} Rename folder</button>
      <button data-m="reset">${icon('reset')} Reset progress</button>
      <button data-m="delete" class="danger">${icon('trash')} Delete folder</button>
    </div>
    <div class="modal-actions"><button class="btn" data-act="close">Close</button></div>`);
  sheet.querySelector('.menu-list').onclick = async (e) => {
    const m = e.target.closest('[data-m]')?.dataset.m;
    if (!m) return;
    closeModal();
    try {
      if (m === 'rename') {
        const name = await promptDialog({ title: 'Rename folder', value: f.name });
        if (!name) return;
        await db.renameFolder(fid, name);
      } else if (m === 'reset') {
        const ok = await confirmDialog({ title: 'Reset progress?', text: `All known/missed counts in "${f.name}" go back to zero. Words stay.`, ok: 'Reset', danger: true });
        if (!ok) return;
        await db.resetFolder(fid);
      } else if (m === 'delete') {
        const ok = await confirmDialog({ title: 'Delete folder?', text: `"${f.name}" and its ${f.cards.length} words will be removed for good.`, ok: 'Delete', danger: true });
        if (!ok) return;
        await db.deleteFolder(fid);
        await loadFolders();
        toast('Folder deleted');
        return go('/');
      }
      await loadFolders();
      route();
    } catch (err) {
      toast(err.message);
    }
  };
}

function openWord(fid, cid) {
  const c = getCard(fid, cid);
  if (!c) return;
  const sheet = showModal(`<h2 class="modal-title">Edit word</h2>
    <form id="w-form">
      <label class="field"><span>Korean</span><input id="w-ko" value="${esc(c.ko)}" lang="ko" required></label>
      <div class="field"><span><label for="w-rom">Reading</label><button type="button" class="link" id="w-auto">Generate</button></span>
        <input id="w-rom" value="${esc(c.rom)}"></div>
      <label class="field"><span>Translation</span><input id="w-tr" value="${esc(c.tr)}" required></label>
      <p class="muted small">${STATUS_LABEL[cardStatus(c)]} · known ${c.good}× · missed ${c.bad}×</p>
      <p class="muted small">Review · ${['rec', 'pro'].map((d) => `${DIR_LABEL[d]}: ${reviewStatus(c.reviews[d])}`).join(' · ')}</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-danger-ghost" id="w-del">${icon('trash')} Delete</button><span class="spacer"></span>
        <button type="button" class="btn" data-act="close">Cancel</button><button class="btn btn-primary">Save</button>
      </div>
    </form>`);
  const $ = (s) => sheet.querySelector(s);
  $('#w-auto').onclick = () => ($('#w-rom').value = romanize($('#w-ko').value));
  $('#w-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await db.updateCard(cid, { ko: $('#w-ko').value, rom: $('#w-rom').value, tr: $('#w-tr').value });
      await loadFolders();
      closeModal();
      route();
    } catch (err) {
      toast(err.message);
    }
  };
  $('#w-del').onclick = async () => {
    try {
      await db.deleteCard(cid);
      await loadFolders();
      closeModal();
      toast('Word deleted');
      route();
    } catch (err) {
      toast(err.message);
    }
  };
}

/* ---------- practice ---------- */

function pickCards(f, opts) {
  if (opts.ids) return shuffle(f.cards.filter((c) => opts.ids.includes(c.id)));
  const pool = shuffle(poolFor(f, opts.set));
  if (opts.count === 'all') return pool;
  // With a limit, weakest words first (stable sort keeps the shuffle within each box).
  return shuffle(pool.sort((a, b) => a.box - b.box).slice(0, +opts.count));
}

// Same Leitner rule as the database's record_answer: correct moves up a box, wrong drops to 0.
function recordAnswer(folderId, cardId, good) {
  const c = getCard(folderId, cardId);
  if (c) {
    if (good) {
      c.good++;
      c.box = Math.min(5, c.box + 1);
    } else {
      c.bad++;
      c.box = 0;
    }
    c.last = Date.now();
  }
  db.answer(folderId, cardId, good).catch(() => toast('Not saved: no connection'));
}

function saveSession(folderId, session) {
  getFolder(folderId)?.sessions.push({ at: Date.now(), ...session });
  db.addSession(folderId, session).catch(() => {});
}

const scoreRing = (pct, label) =>
  `<div class="ring" style="--p:${pct}"><span><b>${pct}%</b><small>${label}</small></span></div>`;

function startPractice(folderId, opts) {
  const f = getFolder(folderId);
  if (!f) return;
  const pool = pickCards(f, opts);
  if (!pool.length) return toast('No words in this set yet');
  const side = (c) => (opts.dir !== 'mix' ? opts.dir : weakerDir(c) === 'pro' ? 'tr' : 'ko');
  state.practice = {
    folderId,
    opts,
    queue: pool.map((c) => ({ id: c.id, side: side(c), tries: 0 })),
    idx: 0,
    flipped: false,
    revealed: false, // true after "Don't know": answer is shown, waiting for Next
    lock: false,
    first: new Map(), // card id -> known on first try
    done: false,
  };
  go('/practice/' + folderId);
}

function renderPractice() {
  const p = state.practice;
  if (p.done) return renderResults();
  document.title = 'Practice · 단어';
  $app.innerHTML = `<div class="practice">
    <header class="p-top">
      <button class="icon-btn" data-act="quit" aria-label="End session">${icon('close')}</button>
      <div class="bar"><i id="p-bar"></i></div>
      <span class="p-count" id="p-count"></span>
    </header>
    <div class="p-stage" id="stage"></div>
    <footer class="p-actions" id="actions"></footer>
    <p class="p-keys"><kbd>Space</kbd> flip · <kbd>←</kbd> don't know · <kbd>→</kbd> know · <kbd>S</kbd> listen</p>
  </div>`;
  drawCard();
}

function face(c, side, q) {
  const again = q?.tries ? '<span class="again-tag">Again</span>' : '';
  if (side === 'ko')
    return `${again}<span class="face-label">한국어</span><div class="f-ko" lang="ko">${esc(c.ko)}</div>
      ${c.rom ? `<div class="f-rom">${esc(c.rom)}</div>` : ''}
      <button class="speak" data-act="speak" aria-label="Listen">${icon('sound')}</button>`;
  return `${again}<span class="face-label">Translation</span><div class="f-tr">${esc(c.tr)}</div>`;
}

function drawCard() {
  const p = state.practice;
  const q = p.queue[p.idx];
  const c = getCard(p.folderId, q.id);
  if (!c) return next(); // word was deleted mid-session
  const back = q.side === 'ko' ? 'tr' : 'ko';
  document.getElementById('stage').innerHTML = `
    <div class="swipe enter" id="swipe"><div class="card-3d" id="card">
      <div class="face front">${face(c, q.side, q)}</div>
      <div class="face back">${face(c, back)}</div>
    </div></div>
    <p class="p-hint" id="hint">Tap the card to flip · swipe right if you know it</p>`;
  drawProgress();
  drawActions();
  attachSwipe();
}

function drawProgress() {
  const p = state.practice;
  document.getElementById('p-bar').style.width = `${(p.idx / p.queue.length) * 100}%`;
  document.getElementById('p-count').textContent = `${Math.min(p.idx + 1, p.queue.length)} / ${p.queue.length}`;
}

function drawActions() {
  const p = state.practice;
  document.getElementById('actions').innerHTML = p.revealed
    ? `<button class="btn btn-lg btn-primary btn-block" data-act="next">Next ${icon('arrow')}</button>`
    : `<button class="btn btn-lg ans bad" data-act="bad">${icon('close')} Don't know</button>
       <button class="btn btn-lg ans good" data-act="good">${icon('check')} Know</button>`;
}

function flip() {
  const p = state.practice;
  if (!p || p.done || p.lock) return;
  p.flipped = !p.flipped;
  document.getElementById('card')?.classList.toggle('flipped', p.flipped);
}

function answer(good) {
  const p = state.practice;
  if (!p || p.done || p.revealed || p.lock) return;
  const q = p.queue[p.idx];
  if (!p.first.has(q.id)) p.first.set(q.id, good);
  recordAnswer(p.folderId, q.id, good);

  const sw = document.getElementById('swipe');
  if (good) {
    p.lock = true;
    sw.style.transform = '';
    sw.classList.add('out-right');
    setTimeout(() => {
      p.lock = false;
      next();
    }, 220);
  } else {
    if (p.opts.repeat && q.tries < 2) {
      p.queue.splice(Math.min(p.queue.length, p.idx + 4), 0, { id: q.id, side: q.side, tries: q.tries + 1 });
    }
    p.revealed = true;
    p.flipped = true;
    sw.classList.add('missed');
    document.getElementById('card').classList.add('flipped');
    document.getElementById('hint').textContent = p.opts.repeat && q.tries < 2 ? "You'll see this one again soon" : '';
    drawProgress();
    drawActions();
  }
}

function next() {
  const p = state.practice;
  p.idx++;
  p.flipped = false;
  p.revealed = false;
  if (p.idx >= p.queue.length) return finish();
  drawCard();
}

function recordSession() {
  const p = state.practice;
  const results = [...p.first.values()];
  if (!results.length || p.recorded) return;
  p.recorded = true;
  const good = results.filter(Boolean).length;
  saveSession(p.folderId, { mode: 'cards', total: results.length, good, bad: results.length - good });
}

function finish() {
  state.practice.done = true;
  recordSession();
  renderResults();
}

function quitPractice() {
  const p = state.practice;
  recordSession();
  state.practice = null;
  go('/folder/' + p.folderId);
}

function renderResults() {
  const p = state.practice;
  const entries = [...p.first.entries()];
  const total = entries.length;
  const good = entries.filter(([, ok]) => ok).length;
  const missed = entries.filter(([, ok]) => !ok).map(([id]) => getCard(p.folderId, id)).filter(Boolean);
  const pct = total ? Math.round((good / total) * 100) : 0;
  const title = pct === 100 ? 'Perfect!' : pct >= 80 ? 'Great work' : pct >= 50 ? 'Getting there' : 'Keep going';
  document.title = 'Results · 단어';
  $app.innerHTML = `<main class="wrap results">
    ${scoreRing(pct, 'known')}
    <h1>${title}</h1>
    <p class="muted">You knew <b>${good}</b> of <b>${total}</b> words on the first try.</p>
    <div class="result-actions">
      ${missed.length ? `<button class="btn btn-primary btn-lg" data-act="practice-missed">${icon('redo')} Practice ${missed.length} missed</button>` : ''}
      <button class="btn btn-lg ${missed.length ? '' : 'btn-primary'}" data-act="practice-again">${icon('play')} Practice again</button>
      <a class="btn btn-lg btn-ghost" href="#/folder/${p.folderId}">Back to folder</a>
    </div>
    ${missed.length ? `<section class="panel"><h2 class="panel-title">Missed words</h2><ul class="word-list">${wordRows(missed)}</ul></section>` : ''}
  </main>`;
}

function attachSwipe() {
  const sw = document.getElementById('swipe');
  let sx = 0, sy = 0, dx = 0, active = false, moved = false;
  sw.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-act]') || state.practice.lock || e.button > 0) return;
    active = true;
    moved = false;
    sx = e.clientX;
    sy = e.clientY;
    dx = 0;
    sw.setPointerCapture(e.pointerId);
    sw.style.transition = 'none';
  });
  sw.addEventListener('pointermove', (e) => {
    if (!active) return;
    dx = e.clientX - sx;
    if (!moved && Math.abs(dx) < 8 && Math.abs(e.clientY - sy) < 8) return;
    moved = true;
    if (state.practice.revealed) return;
    sw.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
    sw.dataset.dir = dx > 70 ? 'good' : dx < -70 ? 'bad' : '';
  });
  const end = () => {
    if (!active) return;
    active = false;
    sw.style.transition = '';
    delete sw.dataset.dir;
    if (!moved) return flip();
    if (!state.practice.revealed && dx > 90) return answer(true);
    sw.style.transform = '';
    if (!state.practice.revealed && dx < -90) answer(false);
  };
  sw.addEventListener('pointerup', end);
  sw.addEventListener('pointercancel', () => {
    active = false;
    sw.style.transition = '';
    sw.style.transform = '';
    delete sw.dataset.dir;
  });
}

function speak(text) {
  if (!('speechSynthesis' in window)) return toast('Speech is not supported in this browser');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('ko'));
  if (voice) u.voice = voice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

const currentCard = () => {
  const p = state.practice;
  return p && !p.done ? getCard(p.folderId, p.queue[p.idx].id) : null;
};

/* ---------- match ---------- */

const MATCH_ROUND = 6; // pairs per screen: 12 tiles fit a phone without scrolling
const snap = (c) => ({ id: c.id, ko: c.ko, rom: c.rom, tr: c.tr });
const fmtTime = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

let timerId = null;
function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function startMatch(folderId, opts) {
  const f = getFolder(folderId);
  const cards = f ? pickCards(f, opts).map(snap) : [];
  if (cards.length < 2) return toast('Match needs at least 2 words');
  const rounds = [];
  for (let i = 0; i < cards.length; i += MATCH_ROUND) rounds.push(cards.slice(i, i + MATCH_ROUND));
  // Fold a tiny last round (1–2 pairs) into the previous one.
  if (rounds.length > 1 && rounds[rounds.length - 1].length < 3) rounds[rounds.length - 2].push(...rounds.pop());
  stopTimer();
  state.game = {
    type: 'match', folderId, opts, rounds, round: 0, tiles: [], selected: null,
    cleared: 0, total: cards.length, mistakes: 0, missed: new Set(),
    startedAt: Date.now(), elapsed: 0, lock: false, done: false,
  };
  go('/match/' + folderId);
}

function renderMatch() {
  const g = state.game;
  if (g.done) return renderMatchResults();
  document.title = 'Match · 단어';
  $app.innerHTML = `<div class="practice game match-game">
    <header class="p-top">
      <button class="icon-btn" data-act="quit-game" aria-label="End game">${icon('close')}</button>
      <div class="bar"><i id="p-bar"></i></div>
      <span class="p-count" id="m-time">0:00</span>
    </header>
    <div class="match-meta"><span id="m-left"></span><span id="m-miss"></span></div>
    <div class="match-grid" id="grid"></div>
  </div>`;
  drawRound();
  stopTimer();
  const tick = () => {
    const el = document.getElementById('m-time');
    if (!el || state.game !== g) return stopTimer();
    el.textContent = fmtTime(Date.now() - g.startedAt);
  };
  tick();
  timerId = setInterval(tick, 1000);
}

function drawRound() {
  const g = state.game;
  g.tiles = shuffle(g.rounds[g.round].flatMap((card) => [{ card, side: 'ko' }, { card, side: 'tr' }])).map((t, key) => ({ ...t, key, gone: false }));
  g.selected = null;
  const grid = document.getElementById('grid');
  grid.classList.toggle('many', g.tiles.length > 12);
  grid.innerHTML = g.tiles
    .map(({ card, side, key }) =>
      side === 'ko'
        ? `<button class="tile-m ko" data-act="tile" data-key="${key}" lang="ko"><b>${esc(card.ko)}</b>${card.rom ? `<small>${esc(card.rom)}</small>` : ''}</button>`
        : `<button class="tile-m tr" data-act="tile" data-key="${key}">${esc(card.tr)}</button>`
    )
    .join('');
  drawMatchMeta();
}

function drawMatchMeta() {
  const g = state.game;
  document.getElementById('p-bar').style.width = `${(g.cleared / g.total) * 100}%`;
  document.getElementById('m-left').textContent =
    `${g.cleared} / ${g.total} matched` + (g.rounds.length > 1 ? ` · round ${g.round + 1} of ${g.rounds.length}` : '');
  document.getElementById('m-miss').textContent = g.mistakes ? `${g.mistakes} mistake${g.mistakes > 1 ? 's' : ''}` : '';
}

function tapTile(key) {
  const g = state.game;
  if (!g || g.type !== 'match' || g.done || g.lock) return;
  const t = g.tiles[key];
  if (!t || t.gone) return;
  const el = (k) => document.querySelector(`.tile-m[data-key="${k}"]`);

  if (g.selected === key) {
    el(key).classList.remove('sel');
    g.selected = null;
    return;
  }
  // Nothing selected yet, or same language tapped: just move the selection.
  if (g.selected == null || g.tiles[g.selected].side === t.side) {
    if (g.selected != null) el(g.selected).classList.remove('sel');
    g.selected = key;
    el(key).classList.add('sel');
    return;
  }

  const a = g.tiles[g.selected];
  const [ea, eb] = [el(g.selected), el(key)];
  g.selected = null;
  ea.classList.remove('sel');
  const ko = a.side === 'ko' ? a.card : t.card;
  const tr = a.side === 'ko' ? t.card : a.card;
  // Same text counts as a match too (two words can share a translation).
  const ok = ko.id === tr.id || ko.tr === tr.tr || ko.ko === tr.ko;

  if (ok) {
    a.gone = t.gone = true;
    ea.classList.add('hit');
    eb.classList.add('hit');
    g.cleared++;
    drawMatchMeta();
    if (g.tiles.every((x) => x.gone)) {
      g.lock = true;
      setTimeout(() => {
        g.lock = false;
        if (state.game !== g) return;
        g.round++;
        g.round >= g.rounds.length ? finishMatch() : drawRound();
      }, 450);
    }
  } else {
    g.mistakes++;
    g.missed.add(ko.id);
    g.missed.add(tr.id);
    for (const e of [ea, eb]) {
      e.classList.remove('wrong');
      void e.offsetWidth; // restart the shake animation
      e.classList.add('wrong');
      setTimeout(() => e.classList.remove('wrong'), 550);
    }
    drawMatchMeta();
  }
}

function finishMatch() {
  const g = state.game;
  g.done = true;
  g.elapsed = Date.now() - g.startedAt;
  stopTimer();
  const bad = Math.min(g.missed.size, g.total);
  saveSession(g.folderId, { mode: 'match', total: g.total, good: g.total - bad, bad });
  renderMatchResults();
}

function renderMatchResults() {
  const g = state.game;
  const pct = Math.round((g.total / (g.total + g.mistakes)) * 100);
  const tricky = [...g.missed].map((id) => getCard(g.folderId, id)).filter(Boolean);
  document.title = 'Results · 단어';
  $app.innerHTML = `<main class="wrap results">
    ${scoreRing(pct, 'accuracy')}
    <h1>${g.mistakes ? 'All matched' : 'Flawless!'}</h1>
    <p class="muted"><b>${g.total}</b> pairs in <b>${fmtTime(g.elapsed)}</b> · ${g.mistakes} mistake${g.mistakes === 1 ? '' : 's'}</p>
    <div class="result-actions">
      ${tricky.length >= 2 ? `<button class="btn btn-primary btn-lg" data-act="match-tricky">${icon('redo')} Match ${tricky.length} tricky words</button>` : ''}
      <button class="btn btn-lg ${tricky.length >= 2 ? '' : 'btn-primary'}" data-act="match-again">${icon('play')} Play again</button>
      <a class="btn btn-lg btn-ghost" href="#/folder/${g.folderId}">Back to folder</a>
    </div>
    ${tricky.length ? `<section class="panel"><h2 class="panel-title">Tricky words</h2><ul class="word-list">${wordRows(tricky)}</ul></section>` : ''}
  </main>`;
}

/* ---------- test ---------- */

function startTest(folderId, opts) {
  const f = getFolder(folderId);
  if (!f || f.cards.length < 2) return toast('A test needs at least 2 words in the folder');
  const cards = pickCards(f, opts);
  if (!cards.length) return toast('No words in this set yet');
  stopTimer();
  state.game = {
    type: 'test', folderId, opts,
    questions: cards.map((c) => makeQuestion(c, f.cards, opts)),
    idx: 0, answered: false, done: false,
  };
  go('/test/' + folderId);
}

function makeQuestion(card, all, opts) {
  const ask = opts.dir !== 'mix' ? opts.dir : weakerDir(card) === 'pro' ? 'tr' : 'ko';
  const ansSide = ask === 'ko' ? 'tr' : 'ko';
  // Up to 3 wrong answers from the folder, each with a different text than the right one.
  const seen = new Set([card[ansSide]]);
  const wrong = [];
  for (const o of shuffle(all)) {
    if (wrong.length === 3) break;
    if (seen.has(o[ansSide])) continue;
    seen.add(o[ansSide]);
    wrong.push(snap(o));
  }
  let type = opts.qtype === 'mix' ? (Math.random() < 0.5 ? 'mc' : 'tf') : opts.qtype;
  if (!wrong.length) type = 'tf';
  const q = { card: snap(card), ask, ansSide, type, choice: null, correct: null };
  if (type === 'mc') {
    q.options = shuffle([q.card, ...wrong]);
  } else {
    q.truth = !wrong.length || Math.random() < 0.5;
    q.shown = q.truth ? q.card : wrong[0];
  }
  return q;
}

function answerText(card, side, withRom = true) {
  return side === 'ko'
    ? `<span class="a-ko" lang="ko"><b>${esc(card.ko)}</b>${withRom && card.rom ? `<small>${esc(card.rom)}</small>` : ''}</span>`
    : `<span class="a-tr">${esc(card.tr)}</span>`;
}

function renderTest() {
  const g = state.game;
  if (g.done) return renderTestResults();
  document.title = 'Test · 단어';
  $app.innerHTML = `<div class="practice game">
    <header class="p-top">
      <button class="icon-btn" data-act="quit-game" aria-label="End test">${icon('close')}</button>
      <div class="bar"><i id="p-bar"></i></div>
      <span class="p-count" id="p-count"></span>
    </header>
    <div class="t-body" id="tq"></div>
    <footer class="p-actions" id="actions"></footer>
    <p class="p-keys" id="t-keys"></p>
  </div>`;
  drawQuestion();
}

function drawQuestion() {
  const g = state.game;
  const q = g.questions[g.idx];
  g.answered = false;
  document.getElementById('p-bar').style.width = `${(g.idx / g.questions.length) * 100}%`;
  document.getElementById('p-count').textContent = `${g.idx + 1} / ${g.questions.length}`;

  const prompt =
    q.ask === 'ko'
      ? `<div class="f-ko" lang="ko">${esc(q.card.ko)}</div>${q.card.rom ? `<div class="f-rom">${esc(q.card.rom)}</div>` : ''}
         <button class="speak" data-act="speak" aria-label="Listen">${icon('sound')}</button>`
      : `<div class="f-tr">${esc(q.card.tr)}</div>`;
  let label, body;
  if (q.type === 'mc') {
    label = q.ask === 'ko' ? 'What does it mean?' : 'Which is the Korean word?';
    body = `<div class="options">${q.options
      .map((o, i) => `<button class="opt" data-act="opt" data-i="${i}"><kbd>${i + 1}</kbd>${answerText(o, q.ansSide)}</button>`)
      .join('')}</div>`;
  } else {
    label = 'True or false?';
    body = `<div class="tf-btns">
      <button class="opt tf" data-act="tf" data-v="1">${icon('check')} True</button>
      <button class="opt tf" data-act="tf" data-v="0">${icon('close')} False</button></div>`;
  }
  const claim = q.type === 'tf'
    ? `<div class="tf-claim"><span class="eq">${q.ask === 'ko' ? 'means' : 'in Korean is'}</span>${answerText(q.shown, q.ansSide)}</div>`
    : '';
  document.getElementById('tq').innerHTML = `
    <div class="t-prompt enter"><span class="face-label">${label}</span>${prompt}${claim}</div>
    ${body}
    <p class="t-feedback" id="tfb" aria-live="polite"></p>`;
  document.getElementById('actions').innerHTML = '';
  document.getElementById('t-keys').innerHTML =
    q.type === 'mc' ? `<kbd>1</kbd>–<kbd>${q.options.length}</kbd> answer · <kbd>S</kbd> listen` : `<kbd>T</kbd> true · <kbd>F</kbd> false · <kbd>S</kbd> listen`;
}

function answerTest(v) {
  const g = state.game;
  if (!g || g.type !== 'test' || g.done || g.answered) return;
  const q = g.questions[g.idx];
  g.answered = true;
  q.choice = v;
  q.correct = q.type === 'mc' ? q.options[v].id === q.card.id : v === q.truth;
  recordAnswer(g.folderId, q.card.id, q.correct);

  const btns = [...document.querySelectorAll('#tq .opt')];
  btns.forEach((b) => (b.disabled = true));
  const chosen = q.type === 'mc' ? btns[v] : btns[v ? 0 : 1];
  const at = g.idx;
  const advance = (ms) => setTimeout(() => state.game === g && g.idx === at && nextQuestion(), ms);

  if (g.opts.feedback === 'end') {
    chosen.classList.add('chosen');
    return advance(300);
  }
  chosen.classList.add(q.correct ? 'right' : 'wrong');
  const fb = document.getElementById('tfb');
  if (q.correct) {
    fb.className = 't-feedback ok';
    fb.textContent = 'Correct!';
    return advance(800);
  }
  btns[q.type === 'mc' ? q.options.findIndex((o) => o.id === q.card.id) : q.truth ? 0 : 1].classList.add('right');
  fb.className = 't-feedback no';
  fb.innerHTML = `${esc(q.card.ko)} = ${esc(q.card.tr)}`;
  document.getElementById('actions').innerHTML =
    `<button class="btn btn-lg btn-primary btn-block" data-act="next-q">Next ${icon('arrow')}</button>`;
}

function nextQuestion() {
  const g = state.game;
  g.idx++;
  if (g.idx >= g.questions.length) return finishTest();
  drawQuestion();
}

function finishTest() {
  const g = state.game;
  g.done = true;
  const good = g.questions.filter((q) => q.correct).length;
  saveSession(g.folderId, { mode: 'test', total: g.questions.length, good, bad: g.questions.length - good });
  renderTestResults();
}

function yourAnswer(q) {
  if (q.type === 'mc') return answerText(q.options[q.choice], q.ansSide, false);
  const [ko, tr] = q.ask === 'ko' ? [q.card.ko, q.shown.tr] : [q.shown.ko, q.card.tr];
  return `“${esc(ko)} = ${esc(tr)}” is ${q.choice ? 'true' : 'false'}`;
}

function renderTestResults() {
  const g = state.game;
  const qs = g.questions;
  const good = qs.filter((q) => q.correct).length;
  const wrong = qs.filter((q) => !q.correct);
  const pct = Math.round((good / qs.length) * 100);
  const title = pct === 100 ? 'Perfect score!' : pct >= 80 ? 'Great work' : pct >= 50 ? 'Getting there' : 'Keep going';
  const review = [...wrong, ...qs.filter((q) => q.correct)]
    .map(
      (q) => `<li class="review ${q.correct ? 'ok' : 'no'}">
        <i class="mark">${icon(q.correct ? 'check' : 'close')}</i>
        <div class="review-body">
          <div><b lang="ko">${esc(q.card.ko)}</b> <span class="rom">${esc(q.card.rom)}</span></div>
          <div class="muted">${esc(q.card.tr)}</div>
          ${q.correct ? '' : `<div class="your">${q.type === 'tf' ? 'You said' : 'Your answer:'} ${yourAnswer(q)}</div>`}
        </div></li>`
    )
    .join('');
  document.title = 'Results · 단어';
  $app.innerHTML = `<main class="wrap results">
    ${scoreRing(pct, 'correct')}
    <h1>${title}</h1>
    <p class="muted"><b>${good}</b> of <b>${qs.length}</b> answers correct.</p>
    <div class="result-actions">
      ${wrong.length ? `<button class="btn btn-primary btn-lg" data-act="test-wrong">${icon('redo')} Retest ${wrong.length} wrong</button>` : ''}
      <button class="btn btn-lg ${wrong.length ? '' : 'btn-primary'}" data-act="test-again">${icon('play')} New test</button>
      <a class="btn btn-lg btn-ghost" href="#/folder/${g.folderId}">Back to folder</a>
    </div>
    <section class="panel"><h2 class="panel-title">Answers</h2><ul class="review-list">${review}</ul></section>
  </main>`;
}

/* ---------- events ---------- */

const currentView = () => location.hash.split('/')[1];
const currentFolderId = () => location.hash.split('/')[2];

function speakCurrent() {
  const g = state.game;
  const view = currentView();
  const r = state.review;
  const ko =
    view === 'test' ? g?.questions[g.idx]?.card.ko
    : view === 'write' ? g?.items[g.idx]?.card.ko
    : view === 'review' ? r?.queue[r.idx]?.card.ko
    : currentCard()?.ko;
  if (ko) speak(ko);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;
  const p = state.practice;
  const g = state.game;
  switch (act) {
    case 'upload': return openUpload(id);
    case 'signout':
      return confirmDialog({ title: 'Sign out?', text: 'Your words stay saved in your account.', ok: 'Sign out' }).then(
        (ok) => ok && db.auth.signOut()
      );
    case 'close': return closeModal();
    case 'quick':
    case 'start': return startSelected(id, prefs());
    case 'folder-menu': return openFolderMenu(id);
    case 'edit-word': return openWord(currentFolderId(), id);
    case 'seg': {
      setPref(el.dataset.pref, el.dataset.val);
      el.parentElement.querySelectorAll('[role=radio]').forEach((b) => b.setAttribute('aria-checked', b === el));
      const f = getFolder(currentFolderId());
      if (el.dataset.pref === 'mode') document.getElementById('practice-opts').innerHTML = practiceOptions(f, prefs());
      return updateStartButton(f);
    }
    case 'speak': return speakCurrent();
    // flashcards
    case 'good': return answer(true);
    case 'bad': return answer(false);
    case 'next': return next();
    case 'quit': return quitPractice();
    case 'practice-missed': {
      const ids = [...p.first.entries()].filter(([, ok]) => !ok).map(([cid]) => cid);
      return startPractice(p.folderId, { ...p.opts, ids });
    }
    case 'practice-again': return startPractice(p.folderId, p.opts);
    // match + test
    case 'tile': return tapTile(+el.dataset.key);
    case 'opt': return answerTest(+el.dataset.i);
    case 'tf': return answerTest(el.dataset.v === '1');
    case 'next-q': return nextQuestion();
    case 'quit-game': {
      stopTimer();
      state.game = null;
      return go('/folder/' + g.folderId);
    }
    case 'match-again': return startMatch(g.folderId, g.opts);
    case 'match-tricky': return startMatch(g.folderId, { ...g.opts, ids: [...g.missed] });
    case 'test-again': return startTest(g.folderId, g.opts);
    case 'test-wrong': return startTest(g.folderId, { ...g.opts, ids: g.questions.filter((q) => !q.correct).map((q) => q.card.id) });
    // write
    case 'write-dontknow': return writeDontKnow();
    case 'write-next': return nextWrite();
    case 'write-again': return startWrite(g.folderId, g.opts);
    case 'write-wrong': return startWrite(g.folderId, { ...g.opts, ids: g.items.filter((i) => i.result === 'wrong').map((i) => i.card.id) });
    // review
    case 'review-settings': return openReviewSettings();
    case 'review-start': return startReview(id);
    case 'review-show': return showReviewAnswer();
    case 'grade': return gradeReview(+el.dataset.g);
    case 'review-quit': return quitReview();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'repeat') setPref('repeat', e.target.checked);
});

function flashcardKeys(e) {
  const p = state.practice;
  if (!p || p.done) return;
  const k = e.key;
  if (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown') {
    e.preventDefault();
    flip();
  } else if (k === 'ArrowLeft' || k === '1') answer(false);
  else if (k === 'ArrowRight' || k === '2' || k === 'Enter') p.revealed ? next() : k !== 'Enter' && answer(true);
  else if (k === 's' || k === 'S') speakCurrent();
}

function testKeys(e) {
  const g = state.game;
  if (!g || g.type !== 'test' || g.done) return;
  const q = g.questions[g.idx];
  const k = e.key.toLowerCase();
  if (k === 's') return speakCurrent();
  if (g.answered) {
    if ((k === 'enter' || k === ' ' || k === 'arrowright') && document.querySelector('[data-act=next-q]')) {
      e.preventDefault();
      nextQuestion();
    }
    return;
  }
  if (q.type === 'mc') {
    const n = Number(k);
    if (n >= 1 && n <= q.options.length) answerTest(n - 1);
  } else if (k === 't' || k === '1') answerTest(true);
  else if (k === 'f' || k === '2') answerTest(false);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $modal.firstChild) return closeModal();
  if ($modal.firstChild || e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey) return;
  const view = currentView();
  if (view === 'practice') flashcardKeys(e);
  else if (view === 'test') testKeys(e);
  else if (view === 'review') reviewKeys(e);
});

/* ---------- routing ---------- */

function route() {
  closeModal();
  const [, view, id] = (location.hash.slice(1) || '/').split('/');
  // Left a session midway (e.g. browser back): keep what was answered, drop the rest.
  if (view !== 'practice' && state.practice && !state.practice.done) {
    recordSession();
    state.practice = null;
  }
  if (state.game && !state.game.done && view !== state.game.type) {
    stopTimer();
    state.game = null;
  }
  if (view !== 'review' && state.review && !state.review.done) {
    if (state.review.results.length) finishReview();
    state.review = null;
  }
  if (view === 'review') {
    if (state.review?.scope === id) return renderReview();
    return go(id === 'all' || !id ? '/' : '/folder/' + id);
  }
  if (view === 'folder') return renderFolder(id);
  if (view === 'practice') {
    if (state.practice?.folderId === id) return renderPractice();
    return go('/folder/' + id);
  }
  if (view === 'match' || view === 'test' || view === 'write') {
    const g = state.game;
    if (g?.type === view && g.folderId === id) return { match: renderMatch, test: renderTest, write: renderWrite }[view]();
    return go('/folder/' + id);
  }
  return renderHome();
}

window.addEventListener('hashchange', () => state.user && route());

/* ---------- sign in ---------- */

function renderLogin(mode = 'signin', message = '') {
  const signup = mode === 'signup';
  document.title = 'Sign in · 단어';
  $app.innerHTML = `<main class="login">
    <div class="empty-mark" lang="ko">단어</div>
    <h1>${signup ? 'Create your account' : 'Welcome back'}</h1>
    <p class="muted">${signup ? 'Your words and progress are saved to this account.' : 'Sign in to practice your Korean words.'}</p>
    <form id="login-form" class="panel">
      <label class="field"><span>Email</span><input id="l-email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input id="l-pass" type="password" minlength="6"
        autocomplete="${signup ? 'new-password' : 'current-password'}" required></label>
      <p class="login-msg" id="l-msg" role="alert">${esc(message)}</p>
      <button class="btn btn-primary btn-lg btn-block" id="l-btn">${signup ? 'Create account' : 'Sign in'}</button>
    </form>
    <p class="muted small">${signup ? 'Already have an account?' : 'First time here?'}
      <button class="link" id="l-switch">${signup ? 'Sign in' : 'Create an account'}</button></p>
  </main>`;
  const $ = (id) => document.getElementById(id);
  $('l-switch').onclick = () => renderLogin(signup ? 'signin' : 'signup');
  $('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('l-email').value.trim();
    const password = $('l-pass').value;
    $('l-btn').disabled = true;
    $('l-msg').textContent = '';
    try {
      if (signup) {
        const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) return renderLogin('signin', 'Check your email and open the confirmation link, then sign in here.');
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // onAuthStateChange takes it from here.
    } catch (err) {
      $('l-msg').textContent = err.message === 'Email not confirmed' ? 'Confirm your email first: open the link we sent you.' : err.message;
      $('l-btn').disabled = false;
    }
  };
}

async function enterApp(user) {
  if (state.user?.id === user.id) return;
  state.user = user;
  try {
    await loadFolders();
    route();
  } catch (err) {
    $app.innerHTML = `<section class="empty"><div class="empty-mark">!</div><h2>Can't load your words</h2>
      <p class="muted">${esc(err.message)}. Check your connection, then reload.</p>
      <button class="btn btn-primary" onclick="location.reload()">Reload</button></section>`;
  }
}

db.auth.onAuthStateChange((event, session) => {
  // Supabase asks not to await other Supabase calls inside this callback.
  setTimeout(() => {
    if (session?.user) return enterApp(session.user);
    state.user = null;
    state.folders = [];
    state.practice = state.game = null;
    stopTimer();
    closeModal();
    renderLogin();
  });
});
