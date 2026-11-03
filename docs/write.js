'use strict';
// Write mode: type the answer yourself, either the Korean (in Hangul) or the translation.
// Small typos still count as correct but are pointed out; a wrong answer must be typed out correctly once
// before moving on. Results count toward the word's progress like the other practice modes.

/* ---------- answer checking ---------- */

// Latin text: lowercase, no accents, one kind of apostrophe (Uzbek o‘ / g‘), no other punctuation.
const normLatin = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʻʼ`´]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();

const normKo = (s) => String(s).replace(/[^\p{L}\p{N}]/gu, '');

// Hangul syllables split into letters, so one wrong letter counts as one mistake, not a whole syllable.
function jamo(s) {
  const out = [];
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const n = code - 0xac00;
      out.push('i' + Math.floor(n / 588), 'v' + Math.floor((n % 588) / 28));
      if (n % 28) out.push('f' + (n % 28));
    } else out.push(ch);
  }
  return out;
}

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Short words must be exact; longer ones forgive one or two slips (Korean counted in letters, e.g. 사과 = ㅅㅏㄱㅘ).
const typoAllowance = (len) => (len <= 4 ? 0 : len <= 8 ? 1 : 2);

// Every accepted form of a translation: the whole text, each part of "a, b / c", "x or y", "x yoki y",
// each with and without a note in brackets.
function meaningVariants(tr) {
  const out = new Set();
  const add = (s) => {
    const n = normLatin(s);
    if (n) out.add(n);
  };
  for (const part of [tr, ...tr.split(/[,;/]|\s+or\s+|\s+yoki\s+/i)]) {
    add(part);
    add(part.replace(/\([^)]*\)/g, ''));
  }
  return [...out];
}

const koreanVariants = (ko) => [...new Set([ko, ...ko.split(/[,;/]/)].map(normKo).filter(Boolean))];

// → { result: 'right' | 'typo' | 'wrong' | 'reading' | 'empty', expected }
function checkWritten(item, text) {
  const c = item.card;
  const writingKorean = item.type === 'ko';
  const typed = writingKorean ? normKo(text) : normLatin(text);
  const expected = writingKorean ? c.ko : c.tr;
  if (!typed) return { result: 'empty', expected };
  if (writingKorean && !HANGUL.test(text) && c.rom && normLatin(text) === normLatin(c.rom)) return { result: 'reading', expected };

  const units = writingKorean ? jamo : (s) => [...s];
  const targets = writingKorean ? koreanVariants(c.ko) : meaningVariants(c.tr);
  let best = Infinity;
  let bestLen = 0;
  for (const t of targets) {
    const d = editDistance(units(typed), units(t));
    if (d < best) [best, bestLen] = [d, units(t).length];
  }
  if (best === 0) return { result: 'right', expected };
  if (best <= typoAllowance(bestLen)) return { result: 'typo', expected };
  return { result: 'wrong', expected };
}

/* ---------- session ---------- */

// Which side you type: 'ko' (write the Korean = produce) or 'tr' (write the meaning = recognize).
function writeType(card, wdir) {
  if (wdir !== 'mix') return wdir;
  return weakerDir(card) === 'pro' ? 'ko' : 'tr';
}

function startWrite(folderId, opts) {
  const f = getFolder(folderId);
  const cards = f ? pickCards(f, opts) : [];
  if (!cards.length) return toast('No words in this set yet');
  stopTimer();
  state.game = {
    type: 'write', folderId, opts, idx: 0, done: false,
    phase: 'ask', // ask → (right | typo → next) or (wrong → copy → next)
    items: cards.map((c) => ({ card: snap(c), type: writeType(c, opts.wdir), given: '', result: null })),
  };
  go('/write/' + folderId);
}

function renderWrite() {
  const g = state.game;
  if (g.done) return renderWriteResults();
  document.title = 'Write · 단어';
  $app.innerHTML = `<div class="practice game">
    <header class="p-top">
      <button class="icon-btn" data-act="quit-game" aria-label="End">${icon('close')}</button>
      <div class="bar"><i id="p-bar"></i></div>
      <span class="p-count" id="p-count"></span>
    </header>
    <div class="t-body" id="wq"></div>
    <footer class="p-actions" id="actions"></footer>
  </div>`;
  drawWriteItem();
}

function drawWriteItem() {
  const g = state.game;
  const item = g.items[g.idx];
  const { card } = item;
  const writingKorean = item.type === 'ko';
  g.phase = 'ask';
  document.getElementById('p-bar').style.width = `${(g.idx / g.items.length) * 100}%`;
  document.getElementById('p-count').textContent = `${g.idx + 1} / ${g.items.length}`;
  const prompt = writingKorean
    ? `<div class="f-tr">${esc(card.tr)}</div>`
    : `<div class="f-ko" lang="ko">${esc(card.ko)}</div>${card.rom ? `<div class="f-rom">${esc(card.rom)}</div>` : ''}
       <button class="speak" data-act="speak" aria-label="Listen">${icon('sound')}</button>`;
  document.getElementById('wq').innerHTML = `
    <div class="t-prompt enter"><span class="face-label">${writingKorean ? 'Write it in Korean' : 'Write the meaning'}</span>${prompt}</div>
    <form class="write-form" id="wr-form" autocomplete="off">
      <input id="wr-in" ${writingKorean ? 'lang="ko"' : ''} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        enterkeyhint="done" placeholder="${writingKorean ? 'Type in Hangul (한글)' : 'Type the meaning'}" aria-label="Your answer">
      <button class="btn btn-primary btn-lg" id="w-check">Check</button>
    </form>
    <div class="w-feedback" id="wr-fb" aria-live="polite"></div>`;
  document.getElementById('actions').innerHTML =
    `<button class="btn btn-lg btn-ghost btn-block" data-act="write-dontknow">I don't know</button>`;
  const input = document.getElementById('wr-in');
  document.getElementById('wr-form').onsubmit = (e) => {
    e.preventDefault();
    submitWrite(input.value);
  };
  input.focus();
}

function submitWrite(text) {
  const g = state.game;
  const item = g.items[g.idx];
  const fb = document.getElementById('wr-fb');
  const input = document.getElementById('wr-in');

  if (g.phase === 'copy') {
    const { result } = checkWritten(item, text);
    if (result === 'right' || result === 'typo') return nextWrite();
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
    return;
  }
  if (g.phase !== 'ask') return nextWrite(); // Enter after a correct answer skips the pause

  const check = checkWritten(item, text);
  if (check.result === 'empty') return input.focus();
  if (check.result === 'reading') {
    fb.className = 'w-feedback hint';
    fb.innerHTML = `That's the reading. Now write it in Hangul.`;
    input.select();
    return;
  }
  finishWriteItem(item, text, check);
}

function finishWriteItem(item, text, check) {
  const g = state.game;
  const fb = document.getElementById('wr-fb');
  const input = document.getElementById('wr-in');
  const correct = check.result === 'right' || check.result === 'typo';
  item.given = text.trim();
  item.result = check.result;
  recordAnswer(g.folderId, item.card.id, correct);
  input.classList.add(correct ? 'ok' : 'no');

  if (correct) {
    g.phase = 'right';
    input.readOnly = true;
    fb.className = 'w-feedback ok';
    fb.innerHTML = check.result === 'typo'
      ? `Correct, small typo. It's spelled <b ${item.type === 'ko' ? 'lang="ko"' : ''}>${esc(check.expected)}</b>`
      : 'Correct!';
    document.getElementById('actions').innerHTML =
      `<button class="btn btn-lg btn-primary btn-block" data-act="write-next">Next ${icon('arrow')}</button>`;
    const at = g.idx;
    if (check.result === 'right') setTimeout(() => state.game === g && g.idx === at && g.phase === 'right' && nextWrite(), 900);
    return;
  }

  // Wrong: show the answer and have it typed out once, which is what makes the spelling stick.
  g.phase = 'copy';
  fb.className = 'w-feedback no';
  fb.innerHTML = `<span class="w-answer"><small>Answer</small><b ${item.type === 'ko' ? 'lang="ko"' : ''}>${esc(check.expected)}</b>
    ${item.type === 'ko' && item.card.rom ? `<small>${esc(item.card.rom)}</small>` : ''}</span>
    <span class="w-copy-hint">Type it once to continue</span>`;
  input.value = '';
  input.classList.remove('no');
  input.placeholder = 'Type it here';
  input.focus();
  document.getElementById('actions').innerHTML =
    `<button class="btn btn-lg btn-ghost btn-block" data-act="write-next">Skip</button>`;
}

function writeDontKnow() {
  const g = state.game;
  if (!g || g.type !== 'write' || g.phase !== 'ask') return;
  const item = g.items[g.idx];
  finishWriteItem(item, '', { result: 'wrong', expected: item.type === 'ko' ? item.card.ko : item.card.tr });
}

function nextWrite() {
  const g = state.game;
  g.idx++;
  if (g.idx >= g.items.length) return finishWrite();
  drawWriteItem();
}

function finishWrite() {
  const g = state.game;
  g.done = true;
  const answered = g.items.filter((i) => i.result);
  const good = answered.filter((i) => i.result !== 'wrong').length;
  if (answered.length) saveSession(g.folderId, { mode: 'write', total: answered.length, good, bad: answered.length - good });
  renderWriteResults();
}

function renderWriteResults() {
  const g = state.game;
  const answered = g.items.filter((i) => i.result);
  const wrong = answered.filter((i) => i.result === 'wrong');
  const typos = answered.filter((i) => i.result === 'typo');
  const good = answered.length - wrong.length;
  const pct = answered.length ? Math.round((good / answered.length) * 100) : 0;
  const title = pct === 100 ? 'Perfect!' : pct >= 80 ? 'Great work' : pct >= 50 ? 'Getting there' : 'Keep going';
  const row = (i, cls) => `<li class="review ${cls}"><i class="mark">${icon(cls === 'no' ? 'close' : 'check')}</i>
    <div class="review-body">
      <div><b lang="ko">${esc(i.card.ko)}</b> <span class="rom">${esc(i.card.rom)}</span></div>
      <div class="muted">${esc(i.card.tr)}</div>
      <div class="your">${i.type === 'ko' ? 'Wrote Korean' : 'Wrote meaning'}: ${i.given ? esc(i.given) : '(skipped)'}</div>
    </div></li>`;
  document.title = 'Results · 단어';
  $app.innerHTML = `<main class="wrap results">
    ${scoreRing(pct, 'correct')}
    <h1>${title}</h1>
    <p class="muted"><b>${good}</b> of <b>${answered.length}</b> written correctly${typos.length ? ` · ${typos.length} with small typos` : ''}.</p>
    <div class="result-actions">
      ${wrong.length ? `<button class="btn btn-primary btn-lg" data-act="write-wrong">${icon('redo')} Write ${wrong.length} again</button>` : ''}
      <button class="btn btn-lg ${wrong.length ? '' : 'btn-primary'}" data-act="write-again">${icon('play')} New round</button>
      <a class="btn btn-lg btn-ghost" href="#/folder/${g.folderId}">Back to folder</a>
    </div>
    ${wrong.length || typos.length ? `<section class="panel"><h2 class="panel-title">To check</h2><ul class="review-list">
      ${wrong.map((i) => row(i, 'no')).join('')}${typos.map((i) => row(i, 'typo')).join('')}</ul></section>` : ''}
  </main>`;
}
