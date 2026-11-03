'use strict';
// Review: spaced repetition. Each word is scheduled separately per direction
// (rec = Korean -> meaning, pro = meaning -> Korean); the database computes due dates (record_review).
// Separate from the practice modes: those train freely, this decides *when* a word comes back.

const DIR_LABEL = { rec: 'Recognize', pro: 'Produce' };
const DAY = 864e5;

function endOfDay(offsetDays = 0) {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime() + offsetDays * DAY;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const reviewCards = (scope) => (scope === 'all' ? state.folders.flatMap((f) => f.cards) : getFolder(scope)?.cards || []);

// The daily new-word limit counts across all folders.
function newStartedToday() {
  const t = startOfToday();
  let n = 0;
  for (const f of state.folders) for (const c of f.cards) for (const r of Object.values(c.reviews)) if (r.createdAt >= t) n++;
  return n;
}

function reviewDirs() {
  const { rdir } = prefs();
  return rdir === 'both' ? ['rec', 'pro'] : [rdir];
}

// What to review now: everything due by the end of today, plus new words up to today's allowance.
function reviewPlan(scope) {
  const p = prefs();
  const end = endOfDay();
  const due = [];
  const fresh = [];
  for (const card of reviewCards(scope)) {
    for (const dir of reviewDirs()) {
      const r = card.reviews[dir];
      if (r) {
        if (r.due <= end) due.push({ card, dir });
      } else if (dir === 'rec' || p.rdir === 'pro' || card.reviews.rec?.reps > 0) {
        // In "Both", producing a word starts only once it has been recognized.
        fresh.push({ card, dir });
      }
    }
  }
  const allowance = Math.max(0, +p.rnew - newStartedToday());
  return { due, fresh: fresh.slice(0, allowance), waiting: fresh.length };
}

function dueBy(scope, until) {
  let n = 0;
  for (const card of reviewCards(scope)) for (const dir of reviewDirs()) if (card.reviews[dir]?.due <= until) n++;
  return n;
}

// Mirrors record_review in the database; used only to label the grade buttons.
function nextInterval(r, grade) {
  const reps = r?.reps || 0;
  const iv = r?.interval || 0;
  const ease = r?.ease || 2.5;
  let days;
  if (grade === 1) days = 0;
  else if (grade === 2) days = reps === 0 ? 1 : Math.max(1, iv * 1.2);
  else if (grade === 3) days = reps === 0 ? 1 : reps === 1 ? 3 : iv * ease;
  else days = reps === 0 ? 4 : Math.max(4, iv * ease * 1.3);
  return Math.min(days, 365);
}

function fmtInterval(days) {
  if (days === 0) return '1 min';
  if (days < 1.5) return '1 day';
  if (days < 30) return `${Math.round(days)} days`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return '1 year';
}

/* ---------- panel on home and folder pages ---------- */

function reviewPanel(scope) {
  const { due, fresh, waiting } = reviewPlan(scope);
  const n = due.length + fresh.length;
  const dirs = reviewDirs().map((d) => DIR_LABEL[d]).join(' + ');
  let body;
  if (n) {
    body = `<div class="review-counts">
        <div><b>${due.length}</b><span>due</span></div>
        <div><b>${fresh.length}</b><span>new</span></div>
      </div>
      <button class="btn btn-primary btn-lg btn-block" data-act="review-start" data-id="${scope}">${icon('play')} Review ${n} word${n === 1 ? '' : 's'}</button>`;
  } else {
    const tomorrow = dueBy(scope, endOfDay(1));
    const note = waiting && +prefs().rnew === 0 ? 'New words are off in review settings.'
      : waiting ? `Daily limit of ${prefs().rnew} new words reached.`
      : !reviewCards(scope).length ? 'Add words to start reviewing.' : '';
    body = `<p class="review-done">${icon('check')} All caught up for today</p>
      <p class="muted small">${tomorrow ? `Tomorrow: ${tomorrow} word${tomorrow === 1 ? '' : 's'}.` : ''} ${note}</p>`;
  }
  return `<section class="panel review-panel">
    <div class="list-head"><h2 class="panel-title">Review · ${dirs}</h2>
      <button class="icon-btn" data-act="review-settings" aria-label="Review settings">${icon('gear')}</button></div>
    ${body}
  </section>`;
}

function openReviewSettings() {
  const p = prefs();
  const sheet = showModal(`<h2 class="modal-title">Review settings</h2>
    ${seg('rnew', 'New words per day', [['0', '0'], ['5', '5'], ['10', '10'], ['20', '20'], ['30', '30']], p.rnew)}
    ${seg('rdir', 'Directions', [['both', 'Both'], ['rec', 'Recognize'], ['pro', 'Produce']], p.rdir)}
    <p class="opt-note"><b>Recognize</b>: see Korean, recall the meaning. <b>Produce</b>: see the meaning, recall the Korean.
      With <b>Both</b>, a word's Produce reviews start after you've recognized it once.</p>
    <div class="modal-actions"><button class="btn btn-primary" id="rs-done">Done</button></div>`);
  sheet.querySelector('#rs-done').onclick = () => {
    closeModal();
    route();
  };
}

/* ---------- session ---------- */

function startReview(scope) {
  const { due, fresh } = reviewPlan(scope);
  if (!due.length && !fresh.length) return toast('Nothing to review right now');
  const queue = shuffle(due).map((x) => ({ ...x, isNew: false, again: 0 }));
  // Spread new words through the due ones (every 3rd card).
  fresh.forEach((x, i) => queue.splice(Math.min(queue.length, i * 3 + 2), 0, { ...x, isNew: true, again: 0 }));
  // Avoid both directions of the same word back to back.
  for (let i = 1; i < queue.length - 1; i++) {
    if (queue[i].card === queue[i - 1].card) [queue[i], queue[i + 1]] = [queue[i + 1], queue[i]];
  }
  state.review = { scope, queue, idx: 0, shown: false, results: [], done: false };
  go('/review/' + scope);
}

function renderReview() {
  const s = state.review;
  if (s.done) return renderReviewResults();
  document.title = 'Review · 단어';
  $app.innerHTML = `<div class="practice">
    <header class="p-top">
      <button class="icon-btn" data-act="review-quit" aria-label="End review">${icon('close')}</button>
      <div class="bar"><i id="p-bar"></i></div>
      <span class="p-count" id="p-count"></span>
    </header>
    <div class="t-body" id="rv"></div>
    <footer class="p-actions" id="actions"></footer>
    <p class="p-keys"><kbd>Space</kbd> show answer · <kbd>1</kbd>–<kbd>4</kbd> grade · <kbd>S</kbd> listen</p>
  </div>`;
  drawReviewItem();
}

// where: 'prompt' (being asked) or 'answer' (revealed), for the romanization setting.
// A reading hidden while asking ("After answer" setting) is still rendered, and revealed with the answer.
function reviewSide(card, side, where) {
  if (side !== 'ko') return `<div class="f-tr">${esc(card.tr)}</div>`;
  const later = where === 'prompt' && !romText(card, 'prompt') && romText(card, 'answer');
  return `<div class="f-ko" lang="ko">${esc(card.ko)}</div>${later ? `<div class="f-rom" data-reveal hidden>${esc(card.rom)}</div>` : romHtml(card, where)}`;
}

function drawReviewItem() {
  const s = state.review;
  const { card, dir, isNew, again } = s.queue[s.idx];
  const [front, back] = dir === 'rec' ? ['ko', 'tr'] : ['tr', 'ko'];
  document.getElementById('p-bar').style.width = `${(s.idx / s.queue.length) * 100}%`;
  document.getElementById('p-count').textContent = `${s.idx + 1} / ${s.queue.length}`;
  const tag = again ? '<span class="again-tag">Again</span>' : isNew ? '<span class="new-tag">New</span>' : '';
  document.getElementById('rv').innerHTML = `
    <div class="t-prompt review-card enter">
      <span class="face-label">${dir === 'rec' ? 'What does it mean?' : 'How do you say it in Korean?'}</span>${tag}
      ${reviewSide(card, front, 'prompt')}
      <div class="hint-wrap">${hintHtml(card)}</div>
      <div class="review-answer" id="rv-answer" hidden>${reviewSide(card, back, 'answer')}${extrasHtml(card)}</div>
      <button class="speak" data-act="speak" aria-label="Listen">${icon('sound')}</button>
    </div>
    <p class="p-hint">${DIR_LABEL[dir]} · ${s.shown ? '' : 'Think of the answer, then show it'}</p>`;
  // In Produce, the Korean (and its sound) is the answer, so keep the speaker hidden until then.
  document.querySelector('#rv .speak').hidden = dir === 'pro';
  drawReviewActions();
}

function drawReviewActions() {
  const s = state.review;
  const actions = document.getElementById('actions');
  if (!s.shown) {
    actions.innerHTML = `<button class="btn btn-lg btn-primary btn-block" data-act="review-show">Show answer</button>`;
    return;
  }
  const { card, dir } = s.queue[s.idx];
  const r = card.reviews[dir];
  const labels = ['Again', 'Hard', 'Good', 'Easy'];
  actions.innerHTML = `<div class="grades">${labels
    .map((l, i) => `<button class="btn grade g${i + 1}" data-act="grade" data-g="${i + 1}"><b>${l}</b><small>${fmtInterval(nextInterval(r, i + 1))}</small></button>`)
    .join('')}</div>`;
}

function showReviewAnswer() {
  const s = state.review;
  if (!s || s.done || s.shown) return;
  s.shown = true;
  document.getElementById('rv-answer').hidden = false;
  document.querySelector('#rv .hint-wrap').hidden = true;
  document.querySelectorAll('#rv [data-reveal]').forEach((el) => (el.hidden = false));
  document.querySelector('#rv .speak').hidden = false;
  document.querySelector('#rv .p-hint').textContent = 'How well did you remember it?';
  drawReviewActions();
}

function gradeReview(grade) {
  const s = state.review;
  if (!s || s.done || !s.shown) return;
  const item = s.queue[s.idx];
  const { card, dir } = item;
  if (!item.again) s.results.push({ card, dir, grade });

  // Update locally right away so counts stay right; the database result replaces it when it arrives.
  const prev = card.reviews[dir];
  const days = nextInterval(prev, grade);
  card.reviews[dir] = {
    ease: prev?.ease ?? 2.5,
    lapses: prev?.lapses ?? 0,
    createdAt: prev?.createdAt ?? Date.now(),
    interval: days,
    reps: grade === 1 ? 0 : (prev?.reps || 0) + 1,
    due: Date.now() + (grade === 1 ? 60e3 : days * DAY),
  };
  countActivity(1);
  db.recordReview(card.id, dir, grade, localDay())
    .then((r) => (card.reviews[dir] = r))
    .catch(() => toast('Not saved: no connection'));

  // Forgotten words come back a few cards later in this session.
  if (grade === 1 && item.again < 3) s.queue.splice(Math.min(s.queue.length, s.idx + 5), 0, { card, dir, isNew: false, again: item.again + 1 });

  s.idx++;
  s.shown = false;
  if (s.idx >= s.queue.length) return finishReview();
  drawReviewItem();
}

function finishReview() {
  const s = state.review;
  s.done = true;
  const forgot = s.results.filter((r) => r.grade === 1).length;
  if (s.scope !== 'all' && s.results.length) {
    saveSession(s.scope, { mode: 'review', total: s.results.length, good: s.results.length - forgot, bad: forgot });
  }
  renderReviewResults();
}

function quitReview() {
  const s = state.review;
  if (s.results.length && !s.done) finishReview();
  state.review = null;
  go(s.scope === 'all' ? '/' : '/folder/' + s.scope);
}

function renderReviewResults() {
  const s = state.review;
  const total = s.results.length;
  const forgot = s.results.filter((r) => r.grade === 1);
  const pct = total ? Math.round(((total - forgot.length) / total) * 100) : 0;
  const tomorrow = dueBy(s.scope, endOfDay(1));
  const back = s.scope === 'all' ? '#/' : `#/folder/${s.scope}`;
  document.title = 'Review done · 단어';
  $app.innerHTML = `<main class="wrap results">
    ${scoreRing(pct, 'remembered')}
    <h1>Review done</h1>
    <p class="muted"><b>${total}</b> reviewed · <b>${forgot.length}</b> forgotten${tomorrow ? ` · <b>${tomorrow}</b> due tomorrow` : ''}</p>
    <div class="result-actions"><a class="btn btn-primary btn-lg" href="${back}">Done</a></div>
    ${forgot.length ? `<section class="panel"><h2 class="panel-title">Forgotten · they'll come back soon</h2>
      <ul class="review-list">${forgot
        .map(({ card, dir }) => `<li class="review no"><i class="mark">${icon('close')}</i><div class="review-body">
          <div><b lang="ko">${esc(card.ko)}</b> <span class="rom">${esc(card.rom)}</span></div>
          <div class="muted">${esc(card.tr)} · ${DIR_LABEL[dir]}</div></div></li>`)
        .join('')}</ul></section>` : ''}
  </main>`;
}

function reviewKeys(e) {
  const s = state.review;
  if (!s || s.done) return;
  const k = e.key;
  if (k === 's' || k === 'S') return speakCurrent();
  if (!s.shown) {
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      showReviewAnswer();
    }
  } else if (k >= '1' && k <= '4') gradeReview(+k);
  else if (k === ' ' || k === 'Enter') {
    e.preventDefault();
    gradeReview(3);
  }
}
