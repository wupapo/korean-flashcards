'use strict';
// Sentence builder: see a word's example sentence in one language and put shuffled word tiles back in order
// in the other. Trains word order (the verb goes last) and particles inside real sentences.

// Words of a sentence as tiles: punctuation and "(…)" notes dropped, Uzbek apostrophes kept.
function sentenceTokens(text) {
  return text
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.,!?…:;"“”—–-]+|[.,!?…:;"“”—–-]+$/g, ''))
    .filter(Boolean);
}

const tokenKey = (w) => w.toLowerCase().replace(/[‘’ʻʼ`´]/g, "'");

// A word can be built when its sentence has a translation and at least 2 tiles on both sides.
function buildable(card) {
  if (!card.ex) return false;
  const [ko, tr] = exampleParts(card.ex);
  return !!tr && sentenceTokens(ko).length >= 2 && sentenceTokens(tr).length >= 2;
}

function startBuild(folderId, opts) {
  const f = getFolder(folderId);
  const cards = f ? pickCards(f, opts, buildable) : [];
  if (!cards.length) return toast('No example sentences in this set yet');
  stopTimer();
  // Other sentences in the folder supply the extra "decoy" tiles.
  const others = f.cards.filter(buildable).map((c) => exampleParts(c.ex));
  state.game = {
    type: 'build', folderId, opts, idx: 0, done: false,
    items: cards.map((c) => buildItem(c, opts.bdir, others)),
  };
  go('/build/' + folderId);
}

function buildItem(card, bdir, others) {
  const [ko, tr] = exampleParts(card.ex);
  const lang = bdir === 'mix' ? (weakerDir(card) === 'pro' ? 'ko' : 'tr') : bdir; // language you build in
  const target = sentenceTokens(lang === 'ko' ? ko : tr);
  const have = new Set(target.map(tokenKey));
  const decoys = [];
  for (const o of shuffle(others)) {
    if (decoys.length >= Math.min(3, Math.max(2, Math.ceil(target.length / 2)))) break;
    const pool = sentenceTokens(o[lang === 'ko' ? 0 : 1]).filter((w) => !have.has(tokenKey(w)));
    if (!pool.length) continue;
    const w = pool[Math.floor(Math.random() * pool.length)];
    have.add(tokenKey(w));
    decoys.push(w);
  }
  const tiles = shuffle([...target, ...decoys]).map((text, key) => ({ key, text }));
  return { card: snap(card), lang, ko, tr, target, tiles, picked: [], result: null, given: '' };
}

function renderBuild() {
  const g = state.game;
  if (g.done) return renderBuildResults();
  document.title = 'Build · 단어';
  $app.innerHTML = `<div class="practice game">
    <header class="p-top">
      <button class="icon-btn" data-act="quit-game" aria-label="End">${icon('close')}</button>
      <div class="bar"><i id="p-bar"></i></div>
      <span class="p-count" id="p-count"></span>
    </header>
    <div class="t-body" id="bq"></div>
    <footer class="p-actions" id="actions"></footer>
    <p class="p-keys"><kbd>Backspace</kbd> remove last · <kbd>Enter</kbd> check / next · <kbd>S</kbd> listen</p>
  </div>`;
  drawBuildItem();
}

function drawBuildItem() {
  const g = state.game;
  const item = g.items[g.idx];
  const ko = item.lang === 'ko';
  g.answered = false;
  document.getElementById('p-bar').style.width = `${(g.idx / g.items.length) * 100}%`;
  document.getElementById('p-count').textContent = `${g.idx + 1} / ${g.items.length}`;
  const prompt = ko
    ? `<div class="b-sentence">${esc(item.tr)}</div>`
    : `<div class="b-sentence" lang="ko">${esc(item.ko)}</div>
       <button class="speak" data-act="speak-word" data-ko="${esc(item.ko)}" aria-label="Listen">${icon('sound')}</button>`;
  document.getElementById('bq').innerHTML = `
    <div class="t-prompt compact enter"><span class="face-label">${ko ? 'Build it in Korean' : 'Build the translation'}</span>${prompt}</div>
    <div class="b-answer" id="b-answer" ${ko ? 'lang="ko"' : ''} aria-label="Your sentence"></div>
    <div class="b-bank" id="b-bank" ${ko ? 'lang="ko"' : ''}></div>
    <div class="w-feedback" id="b-fb" aria-live="polite"></div>`;
  drawBuildTiles();
}

function drawBuildTiles() {
  const g = state.game;
  const item = g.items[g.idx];
  const used = new Set(item.picked);
  const tile = (t, where) =>
    `<button class="b-tile" data-act="build-tile" data-key="${t.key}" data-where="${where}" ${g.answered ? 'disabled' : ''}>${esc(t.text)}</button>`;
  document.getElementById('b-answer').innerHTML = item.picked.map((k) => tile(item.tiles[k], 'answer')).join('')
    || '<span class="b-placeholder">Tap the words below in order</span>';
  // Bank tiles keep their place; a used tile leaves an empty slot so the others don't jump around.
  document.getElementById('b-bank').innerHTML = item.tiles
    .map((t) => (used.has(t.key) ? `<span class="b-tile ghost">${esc(t.text)}</span>` : tile(t, 'bank')))
    .join('');
  if (!g.answered) {
    document.getElementById('actions').innerHTML = `<button class="btn btn-lg btn-ghost" data-act="build-skip">I don't know</button>
      <button class="btn btn-lg btn-primary" data-act="build-check" ${item.picked.length ? '' : 'disabled'}>Check</button>`;
  }
}

function tapBuildTile(key, where) {
  const g = state.game;
  if (!g || g.type !== 'build' || g.answered) return;
  const item = g.items[g.idx];
  if (where === 'bank' && !item.picked.includes(key)) item.picked.push(key);
  if (where === 'answer') item.picked = item.picked.filter((k) => k !== key);
  if (item.lang === 'ko' && where === 'bank') speak(item.tiles[key].text, 1);
  drawBuildTiles();
}

function checkBuild(skipped = false) {
  const g = state.game;
  if (!g || g.type !== 'build' || g.answered) return;
  const item = g.items[g.idx];
  if (!skipped && !item.picked.length) return;
  const given = item.picked.map((k) => item.tiles[k].text);
  const same = (a, b) => a.length === b.length && a.every((w, i) => tokenKey(w) === tokenKey(b[i]));
  const correct = !skipped && same(given, item.target);
  // Right words in another order: Korean order is fairly free, but this drills the usual one.
  const reordered = !correct && !skipped && same([...given].sort(), [...item.target].sort());
  g.answered = true;
  item.given = given.join(' ');
  item.result = correct ? 'right' : 'wrong';
  recordAnswer(g.folderId, item.card.id, correct);
  drawBuildTiles();
  document.getElementById('b-answer').classList.add(correct ? 'ok' : 'no');
  const fb = document.getElementById('b-fb');
  fb.className = `w-feedback ${correct ? 'ok' : 'no'}`;
  fb.innerHTML = `${correct ? 'Correct!' : reordered ? 'Right words, different order. The usual order:' : skipped ? 'The answer:' : 'Not quite. The answer:'}
    <div class="b-full"><span lang="ko">${esc(item.ko)}</span>
      <button class="link" data-act="speak-word" data-ko="${esc(item.ko)}" aria-label="Listen">${icon('sound')}</button>
      <small>${esc(item.tr)}</small></div>
    <div class="b-word"><b lang="ko">${esc(item.card.ko)}</b> ${romHtml(item.card, 'answer')} <span class="muted">${esc(item.card.tr)}</span></div>`;
  document.getElementById('actions').innerHTML =
    `<button class="btn btn-lg btn-primary btn-block" data-act="build-next">Next ${icon('arrow')}</button>`;
  speak(item.ko);
}

function nextBuild() {
  const g = state.game;
  g.idx++;
  if (g.idx >= g.items.length) return finishBuild();
  drawBuildItem();
}

function finishBuild() {
  const g = state.game;
  g.done = true;
  window.speechSynthesis?.cancel();
  const answered = g.items.filter((i) => i.result);
  const good = answered.filter((i) => i.result === 'right').length;
  if (answered.length) saveSession(g.folderId, { mode: 'build', total: answered.length, good, bad: answered.length - good });
  renderBuildResults();
}

function renderBuildResults() {
  const g = state.game;
  const answered = g.items.filter((i) => i.result);
  const wrong = answered.filter((i) => i.result === 'wrong');
  const good = answered.length - wrong.length;
  const pct = answered.length ? Math.round((good / answered.length) * 100) : 0;
  const title = pct === 100 ? 'Perfect!' : pct >= 80 ? 'Great building' : pct >= 50 ? 'Getting there' : 'Keep building';
  document.title = 'Results · 단어';
  $app.innerHTML = `<main class="wrap results">
    ${scoreRing(pct, 'correct')}
    <h1>${title}</h1>
    <p class="muted"><b>${good}</b> of <b>${answered.length}</b> sentences built correctly.</p>
    <div class="result-actions">
      ${wrong.length ? `<button class="btn btn-primary btn-lg" data-act="build-wrong">${icon('redo')} Build ${wrong.length} again</button>` : ''}
      <button class="btn btn-lg ${wrong.length ? '' : 'btn-primary'}" data-act="build-again">${icon('play')} New round</button>
      <a class="btn btn-lg btn-ghost" href="#/folder/${g.folderId}">Back to folder</a>
    </div>
    ${wrong.length ? `<section class="panel"><h2 class="panel-title">To practice</h2><ul class="review-list">${wrong
      .map((i) => `<li class="review no"><i class="mark">${icon('close')}</i><div class="review-body">
        <div><b lang="ko">${esc(i.ko)}</b> <button class="link" data-act="speak-word" data-ko="${esc(i.ko)}" aria-label="Listen">${icon('sound')}</button></div>
        <div class="muted">${esc(i.tr)}</div>
        <div class="your">You built: ${i.given ? esc(i.given) : '(skipped)'}</div></div></li>`)
      .join('')}</ul></section>` : ''}
  </main>`;
}

function buildKeys(e) {
  const g = state.game;
  if (!g || g.type !== 'build' || g.done) return;
  const item = g.items[g.idx];
  const k = e.key;
  if (k === 's' || k === 'S') return speak(item.ko);
  if (k === 'Enter') {
    e.preventDefault();
    return g.answered ? nextBuild() : checkBuild();
  }
  if (k === 'Backspace' && !g.answered && item.picked.length) {
    e.preventDefault();
    item.picked.pop();
    drawBuildTiles();
  }
}
