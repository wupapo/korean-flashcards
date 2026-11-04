'use strict';
// Particle drill: a word's example sentence with one particle blanked out (사과__ 먹어요); pick the right one.
// Particles are found in the sentences automatically: a word ending is only treated as a particle when what's
// before it is a known noun (your words plus common ones) and the particle's form fits that noun's last sound.

const PARTICLE_GROUPS = {
  obj: { forms: ['을', '를'], tip: 'Object marker: what the action is done to (Uzbek -ni).' },
  subj: { forms: ['이', '가'], tip: 'Subject marker: who or what does it, or is described.' },
  top: { forms: ['은', '는'], tip: "Topic marker: 'as for …', what the sentence is about." },
  and: { forms: ['과', '와'], tip: "'and' / 'with' between nouns (Uzbek va / bilan)." },
  ro: { forms: ['으로', '로'], tip: "'by means of' or 'toward' (Uzbek bilan / tomon). 로 after a vowel or ㄹ." },
  at: { forms: ['에'], tip: 'Place where something is or goes to, or a time (Uzbek -da / -ga).' },
  eseo: { forms: ['에서'], tip: "Place where an action happens, or 'from' (Uzbek -da / -dan)." },
  to: { forms: ['에게', '한테', '께'], tip: 'To a person (Uzbek -ga).' },
  hago: { forms: ['하고'], tip: "'and' / 'with', in speech (Uzbek va / bilan)." },
  of: { forms: ['의'], tip: "Possession: 'of', ''s' (Uzbek -ning)." },
  also: { forms: ['도'], tip: "'also', 'too' (Uzbek ham)." },
  only: { forms: ['만'], tip: "'only' (Uzbek faqat)." },
  until: { forms: ['까지'], tip: "'until', 'up to' (Uzbek -gacha)." },
  from: { forms: ['부터'], tip: "'from', 'starting at' (Uzbek -dan boshlab)." },
};
// Wrong options come only from these groups, and never from one that could also fit the same slot
// (as for "저녁에" vs "저녁은", or "친구와 이야기해요" vs "친구가 이야기해요").
const PARTICLE_DECOYS = ['obj', 'subj', 'at', 'eseo', 'ro'];
const PARTICLE_CLASH = {
  subj: ['top', 'also', 'only', 'to', 'and'], top: ['subj', 'obj', 'also', 'only'], obj: ['top', 'also', 'only'],
  at: ['ro'], ro: ['at', 'eseo'], eseo: ['ro'], to: ['subj', 'top'], and: ['subj', 'hago', 'to'], hago: ['subj', 'and', 'to'],
  also: ['subj', 'top', 'obj'], only: ['subj', 'top', 'obj'],
};
const BATCHIM_RULE = 'After a final consonant: 을 · 이 · 은 · 과 · 으로. After a vowel: 를 · 가 · 는 · 와 · 로.';

// Every particle form, longest first, with the sound it must follow: C = final consonant, V = vowel.
const PARTICLE_FORMS = Object.entries(PARTICLE_GROUPS)
  .flatMap(([group, { forms }]) =>
    forms.map((p, i) => ({ p, group, after: forms.length === 2 && group !== 'to' ? (i === 0 ? 'C' : 'V') : null })))
  .sort((a, b) => b.p.length - a.p.length);

// Common nouns and pronouns that example sentences use besides your own words.
const COMMON_NOUNS = `저 나 우리 제 친구 오늘 내일 어제 아침 점심 저녁 밤 주말 집 학교 공원 사람 사람들 날씨 여름 겨울 봄 가을
  동생 형 누나 언니 오빠 할머니 할아버지 아이들 편지 사진 그림 노래 음식 선물 숙제 이름 꿀 풀 논 강 바다 바닷가 감자 국 주스
  빵 자동차 캥거루 강아지 고양이 개 꿈 답 버스 비 서울 책상 종이 질문 강의 주차장 시간 영화 음악 가게 시장 식당 병원 은행 회사
  방 문 손 눈 얼굴 몸 옆 앞 뒤 위 안 여기 거기 저기 이것 그것 저것 이거 그거 저거 무엇 누구 어디 언제 그 사람`
  .split(/\s+/).filter(Boolean);

const lastSyllable = (s) => {
  const code = s.codePointAt(s.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 ? code % 28 : null; // final consonant index (0 = none), null if not Hangul
};

function particleFits(stem, form) {
  if (!form.after) return true;
  const fin = lastSyllable(stem);
  if (fin === null) return false;
  if (form.p === '로') return fin === 0 || fin === 8; // 로 also follows ㄹ
  if (form.p === '으로') return fin !== 0 && fin !== 8;
  return form.after === 'C' ? fin !== 0 : fin === 0;
}

function knownNouns() {
  if (knownNouns.cache?.at === state.folders) return knownNouns.cache.set;
  const set = new Set(COMMON_NOUNS);
  for (const f of state.folders) for (const c of f.cards) if (!/다$/.test(c.ko)) set.add(c.ko);
  knownNouns.cache = { at: state.folders, set };
  return set;
}

// The particles in a Korean sentence: [{ index, stem, form }].
function findParticles(sentence) {
  const nouns = knownNouns();
  const out = [];
  sentenceTokens(sentence).forEach((tok, index) => {
    if (nouns.has(tok)) return; // the whole word is a noun (오이), not noun + particle (오 + 이)
    for (const form of PARTICLE_FORMS) {
      if (!tok.endsWith(form.p)) continue;
      const stem = tok.slice(0, -form.p.length);
      if (stem && nouns.has(stem) && particleFits(stem, form)) {
        out.push({ index, stem, form });
        return;
      }
    }
  });
  return out;
}

const particleQuestion = (card) => {
  if (!card.ex) return null;
  const [ko, tr] = exampleParts(card.ex);
  const found = findParticles(ko);
  if (!found.length) return null;
  const own = found.filter((x) => x.stem === card.ko);
  const pick = (own.length ? own : found)[Math.floor(Math.random() * (own.length || found.length))];
  return { ko, tr, ...pick };
};
const hasParticle = (card) => !!(card.ex && findParticles(exampleParts(card.ex)[0]).length);

// The right form for a stem within a group (을 or 를, …).
const formFor = (group, stem) =>
  PARTICLE_FORMS.find((f) => f.group === group && particleFits(stem, f))?.p ?? PARTICLE_GROUPS[group].forms[0];

function particleOptions(q) {
  const { group, p } = q.form;
  const opts = [p];
  const pair = PARTICLE_GROUPS[group].forms.length === 2 && group !== 'to'
    ? PARTICLE_GROUPS[group].forms.find((x) => x !== p) : null;
  if (pair) opts.push(pair); // the wrong-sound twin teaches the batchim rule
  const clash = PARTICLE_CLASH[group] || [];
  const others = shuffle(PARTICLE_DECOYS)
    .filter((gr) => gr !== group && !clash.includes(gr));
  for (const gr of others) {
    if (opts.length >= 4) break;
    const f = formFor(gr, q.stem);
    if (!opts.includes(f)) opts.push(f);
  }
  return shuffle(opts);
}

function startParticle(folderId, opts) {
  const f = getFolder(folderId);
  const cards = f ? pickCards(f, opts, hasParticle) : [];
  if (!cards.length) return toast('No sentences with particles in this set yet');
  stopTimer();
  const items = cards.map((c) => {
    const q = particleQuestion(c);
    return { card: snap(c), ...q, options: particleOptions(q), given: '', result: null };
  });
  state.game = { type: 'particle', folderId, opts, idx: 0, done: false, items };
  go('/particle/' + folderId);
}

function renderParticle() {
  const g = state.game;
  if (g.done) return renderParticleResults();
  document.title = 'Particles · 단어';
  $app.innerHTML = `<div class="practice game">
    <header class="p-top">
      <button class="icon-btn" data-act="quit-game" aria-label="End">${icon('close')}</button>
      <div class="bar"><i id="p-bar"></i></div>
      <span class="p-count" id="p-count"></span>
    </header>
    <div class="t-body" id="pq"></div>
    <footer class="p-actions" id="actions"></footer>
    <p class="p-keys"><kbd>1</kbd>–<kbd>4</kbd> choose · <kbd>Enter</kbd> next · <kbd>S</kbd> listen</p>
  </div>`;
  drawParticleItem();
}

// The sentence with the particle as a blank (or filled in once answered).
function particleSentence(item, fill, cls = '') {
  const toks = item.ko.split(/\s+/);
  let n = -1;
  return toks
    .map((raw) => {
      // Count only real words, the same way sentenceTokens does, to find the blanked one.
      if (!sentenceTokens(raw).length) return esc(raw);
      n++;
      if (n !== item.index) return esc(raw);
      const at = raw.indexOf(item.stem + item.form.p);
      const before = raw.slice(0, at);
      const after = raw.slice(at + item.stem.length + item.form.p.length);
      return `${esc(before + item.stem)}<span class="p-blank ${cls}">${fill ? esc(fill) : '&nbsp;?&nbsp;'}</span>${esc(after)}`;
    })
    .join(' ');
}

function drawParticleItem() {
  const g = state.game;
  const item = g.items[g.idx];
  g.answered = false;
  document.getElementById('p-bar').style.width = `${(g.idx / g.items.length) * 100}%`;
  document.getElementById('p-count').textContent = `${g.idx + 1} / ${g.items.length}`;
  document.getElementById('pq').innerHTML = `
    <div class="t-prompt compact enter"><span class="face-label">Fill in the particle</span>
      <div class="b-sentence p-sentence" lang="ko" id="p-sent">${particleSentence(item)}</div>
      <div class="p-tr">${esc(item.tr)}</div>
    </div>
    <div class="options p-options" lang="ko">${item.options
      .map((o, i) => `<button class="opt" data-act="particle-opt" data-i="${i}"><kbd>${i + 1}</kbd><span class="a-ko">${esc(o)}</span></button>`)
      .join('')}</div>
    <div class="w-feedback" id="p-fb" aria-live="polite"></div>`;
  document.getElementById('actions').innerHTML = '';
}

function answerParticle(i) {
  const g = state.game;
  if (!g || g.type !== 'particle' || g.done || g.answered) return;
  const item = g.items[g.idx];
  const chosen = item.options[i];
  const correct = chosen === item.form.p;
  g.answered = true;
  item.given = chosen;
  item.result = correct ? 'right' : 'wrong';
  const btns = [...document.querySelectorAll('.p-options .opt')];
  btns.forEach((b) => (b.disabled = true));
  btns[i].classList.add(correct ? 'right' : 'wrong');
  btns[item.options.indexOf(item.form.p)].classList.add('right');
  document.getElementById('p-sent').innerHTML = particleSentence(item, item.form.p, 'ok');
  // Grammar practice, not word recall: counts toward the daily goal but leaves word progress alone.
  countActivity(1);
  db.logActivity(localDay(), 1).catch(() => {});
  const twin = !correct && PARTICLE_GROUPS[item.form.group].forms.includes(chosen);
  const fb = document.getElementById('p-fb');
  fb.className = `w-feedback ${correct ? 'ok' : 'no'}`;
  fb.innerHTML = `${correct ? 'Correct!' : `<span>It's <b lang="ko">${esc(item.form.p)}</b></span>`}
    <div class="p-tip"><b lang="ko">${esc(PARTICLE_GROUPS[item.form.group].forms.join(' / '))}</b> ${esc(PARTICLE_GROUPS[item.form.group].tip)}
      ${twin ? `<br><span class="p-rule">${esc(BATCHIM_RULE)}</span>` : ''}</div>
    <button class="btn btn-sm" data-act="speak-word" data-ko="${esc(item.ko)}">${icon('sound')} Listen</button>`;
  document.getElementById('actions').innerHTML =
    `<button class="btn btn-lg btn-primary btn-block" data-act="particle-next">Next ${icon('arrow')}</button>`;
  speak(item.ko);
}

function nextParticle() {
  const g = state.game;
  g.idx++;
  if (g.idx >= g.items.length) return finishParticle();
  drawParticleItem();
}

function finishParticle() {
  const g = state.game;
  g.done = true;
  window.speechSynthesis?.cancel();
  const answered = g.items.filter((i) => i.result);
  const good = answered.filter((i) => i.result === 'right').length;
  if (answered.length) saveSession(g.folderId, { mode: 'particle', total: answered.length, good, bad: answered.length - good });
  renderParticleResults();
}

function renderParticleResults() {
  const g = state.game;
  const answered = g.items.filter((i) => i.result);
  const wrong = answered.filter((i) => i.result === 'wrong');
  const good = answered.length - wrong.length;
  const pct = answered.length ? Math.round((good / answered.length) * 100) : 0;
  const title = pct === 100 ? 'Perfect!' : pct >= 80 ? 'Great work' : pct >= 50 ? 'Getting there' : 'Keep going';
  document.title = 'Results · 단어';
  $app.innerHTML = `<main class="wrap results">
    ${scoreRing(pct, 'correct')}
    <h1>${title}</h1>
    <p class="muted"><b>${good}</b> of <b>${answered.length}</b> particles right.</p>
    <div class="result-actions">
      ${wrong.length ? `<button class="btn btn-primary btn-lg" data-act="particle-wrong">${icon('redo')} Practice ${wrong.length} again</button>` : ''}
      <button class="btn btn-lg ${wrong.length ? '' : 'btn-primary'}" data-act="particle-again">${icon('play')} New round</button>
      <a class="btn btn-lg btn-ghost" href="#/folder/${g.folderId}">Back to folder</a>
    </div>
    ${wrong.length ? `<section class="panel"><h2 class="panel-title">To practice</h2><ul class="review-list">${wrong
      .map((i) => `<li class="review no"><i class="mark">${icon('close')}</i><div class="review-body">
        <div lang="ko">${particleSentence(i, i.form.p, 'ok')}</div>
        <div class="muted">${esc(i.tr)}</div>
        <div class="your">You chose: <span lang="ko">${esc(i.given)}</span> · ${esc(PARTICLE_GROUPS[i.form.group].tip)}</div></div></li>`)
      .join('')}</ul></section>` : ''}
  </main>`;
}

function particleKeys(e) {
  const g = state.game;
  if (!g || g.type !== 'particle' || g.done) return;
  const k = e.key;
  if (k === 's' || k === 'S') return speak(g.items[g.idx].ko);
  if (g.answered) {
    if (k === 'Enter' || k === 'ArrowRight' || k === ' ') {
      e.preventDefault();
      nextParticle();
    }
    return;
  }
  const n = Number(k);
  if (n >= 1 && n <= g.items[g.idx].options.length) answerParticle(n - 1);
}
