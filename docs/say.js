'use strict';
// Speaking check: say a word or sentence out loud and the browser's speech recognition (Korean) checks what it heard.
// "Read aloud" shows the Korean; "Say it from the meaning" shows only the translation, so you produce it yourself.

const Recognizer = window.SpeechRecognition || window.webkitSpeechRecognition;
const SAY_TRIES = 3;
const SINO_DIGITS = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십'];

const sayText = (item) => (item.sentence ? item.ko : item.card.ko);
const sayMeaning = (item) => (item.sentence ? item.tr : item.card.tr);

// Hangul only, no spaces or punctuation; a lone number the recognizer wrote as digits becomes its Korean word.
function normSaid(s) {
  const t = s.trim();
  if (/^\d+$/.test(t) && +t <= 10) return SINO_DIGITS[+t];
  return t.replace(/[^가-힣]/g, '');
}

// How close the best of the recognizer's guesses is: 'right', 'close' or 'wrong', plus what it heard.
function judgeSaid(alternatives, target, sentence) {
  const want = normSaid(target);
  const wantJ = jamo(want);
  let best = { result: 'wrong', heard: alternatives[0] || '', sim: -1 };
  for (const alt of alternatives) {
    const got = normSaid(alt);
    if (!got) continue;
    if (got === want || got.includes(want)) return { result: 'right', heard: alt, sim: 1 };
    const sim = 1 - editDistance(jamo(got), wantJ) / Math.max(wantJ.length, 1);
    if (sim > best.sim) best = { heard: alt, sim, result: 'wrong' };
  }
  // Sentences get some room for the recognizer's own mistakes; single words must come out exactly.
  if (sentence && best.sim >= 0.85) best.result = 'right';
  else if (best.sim >= (sentence ? 0.6 : 0.7)) best.result = 'close';
  return best;
}

function startSay(folderId, opts) {
  if (!Recognizer) return toast('This browser cannot recognize speech. Try Chrome or Safari.');
  const f = getFolder(folderId);
  const sentence = opts.smode === 'sentence';
  const cards = f ? pickCards(f, opts, sentence ? (c) => !!c.ex : undefined) : [];
  if (!cards.length) return toast(sentence ? 'No example sentences in this set yet' : 'No words in this set yet');
  stopTimer();
  state.game = {
    type: 'say', folderId, opts, idx: 0, done: false,
    items: cards.map((c) => {
      const [ko, tr] = c.ex ? exampleParts(c.ex) : ['', ''];
      return { card: snap(c), sentence: sentence && !!ko, ko, tr, tries: 0, heard: [], result: null };
    }),
  };
  go('/say/' + folderId);
}

function renderSay() {
  const g = state.game;
  if (g.done) return renderSayResults();
  document.title = 'Speak · 단어';
  $app.innerHTML = `<div class="practice game">
    <header class="p-top">
      <button class="icon-btn" data-act="quit-game" aria-label="End">${icon('close')}</button>
      <div class="bar"><i id="p-bar"></i></div>
      <span class="p-count" id="p-count"></span>
    </header>
    <div class="t-body" id="sq"></div>
    <footer class="p-actions" id="actions"></footer>
    <p class="p-keys"><kbd>Space</kbd> speak · <kbd>S</kbd> listen · <kbd>Enter</kbd> next</p>
  </div>`;
  drawSayItem();
}

function drawSayItem() {
  const g = state.game;
  const item = g.items[g.idx];
  const fromMeaning = g.opts.sprompt === 'tr';
  g.answered = false;
  document.getElementById('p-bar').style.width = `${(g.idx / g.items.length) * 100}%`;
  document.getElementById('p-count').textContent = `${g.idx + 1} / ${g.items.length}`;
  const korean = item.sentence
    ? `<div class="b-sentence" lang="ko">${esc(item.ko)}</div>`
    : `<div class="f-ko" lang="ko">${esc(item.card.ko)}</div>${romHtml(item.card, 'prompt')}`;
  const prompt = fromMeaning
    ? `<div class="${item.sentence ? 'b-sentence' : 'f-tr'}">${esc(sayMeaning(item))}</div><div class="say-reveal" id="s-reveal" hidden></div>`
    : `${korean}${item.sentence ? `<div class="p-tr">${esc(item.tr)}</div>` : ''}`;
  document.getElementById('sq').innerHTML = `
    <div class="t-prompt compact enter"><span class="face-label">${fromMeaning ? 'Say it in Korean' : 'Read it aloud'}</span>${prompt}</div>
    <div class="say-controls">
      ${fromMeaning ? '' : `<button class="btn btn-sm" data-act="say-listen">${icon('sound')} Listen first</button>`}
      <button class="say-mic" id="s-mic" data-act="say-mic" aria-label="Speak">${icon('mic')}</button>
      <span class="say-status" id="s-status">Tap and speak</span>
    </div>
    <div class="w-feedback" id="s-fb" aria-live="polite"></div>`;
  document.getElementById('actions').innerHTML =
    `<button class="btn btn-lg btn-ghost btn-block" data-act="say-skip">${fromMeaning ? "I don't know" : 'Skip'}</button>`;
}

let sayRec = null;

function listenForSpeech() {
  const g = state.game;
  if (!g || g.type !== 'say' || g.answered) return;
  if (sayRec) return sayRec.abort(); // second tap cancels
  window.speechSynthesis?.cancel(); // don't let it hear its own voice
  const item = g.items[g.idx];
  const rec = new Recognizer();
  rec.lang = 'ko-KR';
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  const mic = document.getElementById('s-mic');
  const status = document.getElementById('s-status');
  let got = false;
  rec.onresult = (e) => {
    got = true;
    const alts = [...e.results[0]].map((a) => a.transcript);
    if (state.game === g && g.items[g.idx] === item) judgeSay(alts);
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Allow the microphone for this site to use Speak');
    else if (e.error === 'no-speech') toast("Didn't hear anything. Try again");
    else if (e.error !== 'aborted') toast('Speech recognition failed: ' + e.error);
  };
  rec.onend = () => {
    sayRec = null;
    if (!document.body.contains(mic)) return;
    mic.classList.remove('on');
    if (!got && !g.answered) status.textContent = 'Tap and speak';
  };
  sayRec = rec;
  mic.classList.add('on');
  status.textContent = 'Listening…';
  try {
    rec.start();
  } catch {
    sayRec = null;
    mic.classList.remove('on');
  }
}

function judgeSay(alts) {
  const g = state.game;
  const item = g.items[g.idx];
  const verdict = judgeSaid(alts, sayText(item), item.sentence);
  item.tries++;
  item.heard.push(verdict.heard);
  const fb = document.getElementById('s-fb');
  const heard = `<span>Heard: <b lang="ko">${esc(verdict.heard || '…')}</b></span>`;
  if (verdict.result === 'right') return finishSayItem(true, heard);
  if (item.tries >= SAY_TRIES) return finishSayItem(false, heard);
  fb.className = `w-feedback ${verdict.result === 'close' ? 'hint' : 'no'}`;
  fb.innerHTML = `${heard}<div>${verdict.result === 'close' ? 'Close! Try once more' : 'Not quite. Try again'}
    (${SAY_TRIES - item.tries} ${SAY_TRIES - item.tries === 1 ? 'try' : 'tries'} left)</div>`;
  document.getElementById('s-status').textContent = 'Tap and speak';
}

function finishSayItem(correct, heard = '') {
  const g = state.game;
  if (!g || g.type !== 'say' || g.answered) return;
  sayRec?.abort();
  const item = g.items[g.idx];
  g.answered = true;
  item.result = correct ? 'right' : 'wrong';
  // Saying a word from its meaning is recall, so it moves the word's progress; reading aloud only counts toward the goal.
  if (g.opts.sprompt === 'tr' && !item.sentence) recordAnswer(g.folderId, item.card.id, correct);
  else {
    countActivity(1);
    db.logActivity(localDay(), 1).catch(() => {});
  }
  const reveal = document.getElementById('s-reveal');
  if (reveal) {
    reveal.innerHTML = item.sentence
      ? `<div class="b-sentence" lang="ko">${esc(item.ko)}</div>`
      : `<div class="f-ko" lang="ko">${esc(item.card.ko)}</div>${romHtml(item.card, 'answer')}`;
    reveal.hidden = false;
  }
  document.getElementById('s-mic').disabled = true;
  document.getElementById('s-status').textContent = '';
  const fb = document.getElementById('s-fb');
  fb.className = `w-feedback ${correct ? 'ok' : 'no'}`;
  fb.innerHTML = `${correct ? 'Correct!' : heard ? 'Not this time. Listen and repeat it once' : 'Listen and repeat it once'}
    ${heard ? `<div class="say-heard">${heard}</div>` : ''}
    <button class="btn btn-sm" data-act="say-listen">${icon('sound')} Listen</button>`;
  document.getElementById('actions').innerHTML =
    `<button class="btn btn-lg btn-primary btn-block" data-act="say-next">Next ${icon('arrow')}</button>`;
  if (!correct) speak(sayText(item), 0.8);
}

function nextSay() {
  const g = state.game;
  sayRec?.abort();
  g.idx++;
  if (g.idx >= g.items.length) return finishSay();
  drawSayItem();
}

function finishSay() {
  const g = state.game;
  g.done = true;
  sayRec?.abort();
  window.speechSynthesis?.cancel();
  const answered = g.items.filter((i) => i.result);
  const good = answered.filter((i) => i.result === 'right').length;
  if (answered.length) saveSession(g.folderId, { mode: 'say', total: answered.length, good, bad: answered.length - good });
  renderSayResults();
}

function renderSayResults() {
  const g = state.game;
  const answered = g.items.filter((i) => i.result);
  const wrong = answered.filter((i) => i.result === 'wrong');
  const good = answered.length - wrong.length;
  const pct = answered.length ? Math.round((good / answered.length) * 100) : 0;
  const title = pct === 100 ? 'Perfect!' : pct >= 80 ? 'Great speaking' : pct >= 50 ? 'Getting there' : 'Keep speaking';
  document.title = 'Results · 단어';
  $app.innerHTML = `<main class="wrap results">
    ${scoreRing(pct, 'understood')}
    <h1>${title}</h1>
    <p class="muted"><b>${good}</b> of <b>${answered.length}</b> understood by the recognizer.</p>
    <div class="result-actions">
      ${wrong.length ? `<button class="btn btn-primary btn-lg" data-act="say-wrong">${icon('redo')} Say ${wrong.length} again</button>` : ''}
      <button class="btn btn-lg ${wrong.length ? '' : 'btn-primary'}" data-act="say-again">${icon('play')} New round</button>
      <a class="btn btn-lg btn-ghost" href="#/folder/${g.folderId}">Back to folder</a>
    </div>
    ${wrong.length ? `<section class="panel"><h2 class="panel-title">To practice</h2><ul class="review-list">${wrong
      .map((i) => `<li class="review no"><i class="mark">${icon('close')}</i><div class="review-body">
        <div><b lang="ko">${esc(sayText(i))}</b> <button class="link" data-act="speak-word" data-ko="${esc(sayText(i))}" aria-label="Listen">${icon('sound')}</button></div>
        <div class="muted">${esc(sayMeaning(i))}</div>
        <div class="your">Heard: ${i.heard.length ? i.heard.map((h) => `<span lang="ko">${esc(h)}</span>`).join(' · ') : '(skipped)'}</div></div></li>`)
      .join('')}</ul></section>` : ''}
  </main>`;
}

function sayKeys(e) {
  const g = state.game;
  if (!g || g.type !== 'say' || g.done) return;
  const k = e.key;
  if (k === 's' || k === 'S') return speak(sayText(g.items[g.idx]));
  if (k === ' ') {
    e.preventDefault();
    if (!g.answered) listenForSpeech();
    return;
  }
  if (k === 'Enter' && g.answered) nextSay();
}
