'use strict';
// Listen mode: hear the Korean word (the device's text-to-speech) without seeing it, then pick its meaning
// or write what you heard in Hangul. Trains the ear, which the reading-based modes skip.

function startListen(folderId, opts) {
  if (!('speechSynthesis' in window)) return toast('This browser cannot play Korean speech');
  const f = getFolder(folderId);
  const cards = f ? pickCards(f, opts) : [];
  if (!cards.length) return toast('No words in this set yet');
  if (opts.lmode === 'mc' && f.cards.length < 2) return toast('Choosing needs at least 2 words in the folder');
  stopTimer();
  state.game = {
    type: 'listen', folderId, opts, idx: 0, answered: false, done: false,
    items: cards.map((c) => listenItem(c, f.cards, opts.lmode)),
  };
  go('/listen/' + folderId);
}

function listenItem(card, all, lmode) {
  const item = { card: snap(card), type: lmode, given: '', result: null };
  if (lmode === 'mc') {
    // Up to 3 other meanings, each with a different text than the right one.
    const seen = new Set([card.tr]);
    const wrong = [];
    for (const o of shuffle(all)) {
      if (wrong.length === 3) break;
      if (seen.has(o.tr)) continue;
      seen.add(o.tr);
      wrong.push(snap(o));
    }
    item.options = shuffle([item.card, ...wrong]);
  }
  return item;
}

function renderListen() {
  const g = state.game;
  if (g.done) return renderListenResults();
  document.title = 'Listen · 단어';
  $app.innerHTML = `<div class="practice game">
    <header class="p-top">
      <button class="icon-btn" data-act="quit-game" aria-label="End">${icon('close')}</button>
      <div class="bar"><i id="p-bar"></i></div>
      <span class="p-count" id="p-count"></span>
    </header>
    <div class="t-body" id="lq"></div>
    <footer class="p-actions" id="actions"></footer>
    <p class="p-keys"><kbd>Space</kbd> play again${g.opts.lmode === 'mc' ? ' · <kbd>1</kbd>–<kbd>4</kbd> choose' : ''}</p>
  </div>`;
  drawListenItem();
}

const playListen = (rate) => {
  const g = state.game;
  speak(g.items[g.idx].card.ko, rate);
};

function drawListenItem() {
  const g = state.game;
  const item = g.items[g.idx];
  g.answered = false;
  document.getElementById('p-bar').style.width = `${(g.idx / g.items.length) * 100}%`;
  document.getElementById('p-count').textContent = `${g.idx + 1} / ${g.items.length}`;
  const answer = item.type === 'mc'
    ? `<div class="options">${item.options
        .map((o, i) => `<button class="opt" data-act="listen-opt" data-i="${i}"><kbd>${i + 1}</kbd><span class="a-tr">${esc(o.tr)}</span></button>`)
        .join('')}</div>`
    : `<form class="write-form" id="li-form" autocomplete="off">
        <input id="li-in" lang="ko" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          enterkeyhint="done" placeholder="Type in Hangul (한글)" aria-label="What you heard">
        <button class="btn btn-primary btn-lg">Check</button>
      </form>`;
  document.getElementById('lq').innerHTML = `
    <div class="t-prompt listen-card enter">
      <span class="face-label">${item.type === 'mc' ? 'What does it mean?' : 'Write what you hear'}</span>
      <div class="listen-btns">
        <button class="listen-play" data-act="listen-play" aria-label="Play again">${icon('sound')}</button>
        <button class="btn btn-sm" data-act="listen-slow">Slower</button>
      </div>
      <div class="listen-reveal" id="l-reveal" hidden></div>
    </div>
    ${answer}
    <p class="t-feedback" id="lfb" aria-live="polite"></p>`;
  document.getElementById('actions').innerHTML = '';
  const form = document.getElementById('li-form');
  if (form) {
    const input = document.getElementById('li-in');
    form.onsubmit = (e) => {
      e.preventDefault();
      g.answered ? nextListen() : answerListen(input.value);
    };
    input.focus();
  }
  setTimeout(() => state.game === g && g.items[g.idx] === item && playListen(), 250);
}

// v: option index (choose) or the typed text (write).
function answerListen(v) {
  const g = state.game;
  if (!g || g.type !== 'listen' || g.done || g.answered) return;
  const item = g.items[g.idx];
  const fb = document.getElementById('lfb');
  let correct;
  let typo = false;
  if (item.type === 'mc') {
    correct = item.options[v].id === item.card.id;
    const btns = [...document.querySelectorAll('#lq .opt')];
    btns.forEach((b) => (b.disabled = true));
    btns[v].classList.add(correct ? 'right' : 'wrong');
    btns[item.options.findIndex((o) => o.id === item.card.id)].classList.add('right');
    item.given = item.options[v].tr;
  } else {
    const check = checkWritten({ type: 'ko', card: item.card }, v);
    if (check.result === 'empty') return;
    if (check.result === 'reading') {
      fb.className = 't-feedback hint';
      fb.textContent = "That's the reading. Now write it in Hangul.";
      return;
    }
    correct = check.result !== 'wrong';
    typo = check.result === 'typo';
    item.given = String(v).trim();
    const input = document.getElementById('li-in');
    input.readOnly = true;
    input.classList.add(correct ? 'ok' : 'no');
  }
  g.answered = true;
  item.result = correct ? (typo ? 'typo' : 'right') : 'wrong';
  recordAnswer(g.folderId, item.card.id, correct);

  const reveal = document.getElementById('l-reveal');
  reveal.innerHTML = `<div class="f-ko" lang="ko">${esc(item.card.ko)}</div>${romHtml(item.card, 'answer')}
    <div class="listen-meaning">${esc(item.card.tr)}</div>${extrasHtml(item.card)}`;
  reveal.hidden = false;
  fb.className = `t-feedback ${correct ? 'ok' : 'no'}`;
  fb.textContent = correct ? (typo ? 'Correct, small typo' : 'Correct!') : 'Not quite: listen once more';
  document.getElementById('actions').innerHTML =
    `<button class="btn btn-lg btn-primary btn-block" data-act="listen-next">Next ${icon('arrow')}</button>`;
  if (!correct) playListen(0.7);
}

function nextListen() {
  const g = state.game;
  g.idx++;
  if (g.idx >= g.items.length) return finishListen();
  drawListenItem();
}

function finishListen() {
  const g = state.game;
  g.done = true;
  speechSynthesis.cancel();
  const answered = g.items.filter((i) => i.result);
  const good = answered.filter((i) => i.result !== 'wrong').length;
  if (answered.length) saveSession(g.folderId, { mode: 'listen', total: answered.length, good, bad: answered.length - good });
  renderListenResults();
}

function renderListenResults() {
  const g = state.game;
  const answered = g.items.filter((i) => i.result);
  const wrong = answered.filter((i) => i.result === 'wrong');
  const good = answered.length - wrong.length;
  const pct = answered.length ? Math.round((good / answered.length) * 100) : 0;
  const title = pct === 100 ? 'Perfect ear!' : pct >= 80 ? 'Great listening' : pct >= 50 ? 'Getting there' : 'Keep listening';
  document.title = 'Results · 단어';
  $app.innerHTML = `<main class="wrap results">
    ${scoreRing(pct, 'correct')}
    <h1>${title}</h1>
    <p class="muted"><b>${good}</b> of <b>${answered.length}</b> recognized by ear.</p>
    <div class="result-actions">
      ${wrong.length ? `<button class="btn btn-primary btn-lg" data-act="listen-wrong">${icon('redo')} Listen to ${wrong.length} again</button>` : ''}
      <button class="btn btn-lg ${wrong.length ? '' : 'btn-primary'}" data-act="listen-again">${icon('play')} New round</button>
      <a class="btn btn-lg btn-ghost" href="#/folder/${g.folderId}">Back to folder</a>
    </div>
    ${wrong.length ? `<section class="panel"><h2 class="panel-title">Missed by ear</h2><ul class="review-list">${wrong
      .map((i) => `<li class="review no"><i class="mark">${icon('close')}</i><div class="review-body">
        <div><b lang="ko">${esc(i.card.ko)}</b> <span class="rom">${esc(i.card.rom)}</span>
          <button class="link" data-act="speak-word" data-ko="${esc(i.card.ko)}">${icon('sound')}</button></div>
        <div class="muted">${esc(i.card.tr)}</div>
        <div class="your">${i.type === 'mc' ? 'Chose' : 'Wrote'}: ${i.given ? esc(i.given) : '—'}</div></div></li>`)
      .join('')}</ul></section>` : ''}
  </main>`;
}

function listenKeys(e) {
  const g = state.game;
  if (!g || g.type !== 'listen' || g.done) return;
  const k = e.key;
  if (k === ' ') {
    e.preventDefault();
    return playListen();
  }
  if (g.answered) {
    if (k === 'Enter' || k === 'ArrowRight') nextListen();
  } else if (g.opts.lmode === 'mc') {
    const n = Number(k);
    if (n >= 1 && n <= g.items[g.idx].options.length) answerListen(n - 1);
  }
}
