# 단어 Flashcards

Personal Korean flashcards. Upload a word list, practice on laptop or phone.

**Live:** https://wupapo.github.io/korean-flashcards/ (sign in with your account).

## How it works

- `docs/` is the whole app: plain HTML/CSS/JS, no build step. GitHub Pages publishes it from the `main` branch on every push.
- Data lives in Supabase. The browser talks to it directly with the **publishable** key in [`docs/config.js`](docs/config.js), which is safe to be public.
- Access control is Supabase Auth (email + password) plus row-level security: every row has a `user_id`, and the policies in [`supabase/schema.sql`](supabase/schema.sql) only let the signed-in user read or change their own rows. Never put a **secret** key in this repo.

## Run locally

```bash
npm start
```

Serves `docs/` at `http://localhost:3000` (and on your Wi-Fi for the phone). It uses the same Supabase data as the live site.

## Word file format

One word per line, `.txt`. Reading (romanization) is optional; it is generated when missing.

```
사과 (sagwa) - olma
학교 - maktab
한국어 | hangugeo | Korean language
물	suv
```

Separators recognised: ` - `, tab, `|`, `;`, `=`, `:`, `,`. Lines starting with `#` are ignored.

Add an example sentence after `::`, written as `Korean = translation`:

```
사과 (sagwa) - olma :: 사과를 먹어요 = Men olma yeyman
```

Examples and a personal **memory hint** can also be added per word (tap the word in its folder).
They show wherever the answer is revealed; a word with a hint gets a **Hint** button on the question side
in Flashcards and Review.

## Settings (gear on the home page)

- **Show romanization**: Always, After answer (hidden while you're asked, so you read Hangul), or Never.
- **Daily goal**: answers per day. Every answer counts (all modes, review, match pairs); the home page shows
  today's progress and your day streak.

## Review (spaced repetition)

The Review panel (home page for all folders, folder page for one) shows the words due today plus a few new ones.
See the prompt, think of the answer, tap **Show answer**, then grade yourself:
**Again** (back in a minute) · **Hard** · **Good** · **Easy**. Each button shows when the word will come back;
good answers push it further out (1 day → 3 days → about a week → …).

- Every word is scheduled twice: **Recognize** (Korean → meaning) and **Produce** (meaning → Korean).
  With "Both", Produce starts once you've recognized the word.
- Settings (gear icon): new words per day (counted across all folders) and which directions to review.
- Keys: `Space` show answer, `1`–`4` grade, `S` listen. Code: [`docs/review.js`](docs/review.js).

## Practice modes

Pick a mode on the folder page; its settings appear below it. "Mixed" direction leans toward the side
you're weaker at (from your review schedule), and toward Produce for words not reviewed yet.

### Listen
Hear the word (your device's Korean voice) without seeing it, then choose its meaning or write it in Hangul.
**Slower** replays it slowly. Code: [`docs/listen.js`](docs/listen.js).

### Mixed folders
**Mix folders** on the home page practices words from several folders together; pick the folders at the top.
Progress still counts for each word in its own folder.

### Write
Type the answer yourself: the Korean in Hangul, or the meaning. Small typos in longer words still count
(and are pointed out); typing the romanization instead of Hangul asks you to try again. A wrong answer
shows the right one, and you type it once to continue. Code: [`docs/write.js`](docs/write.js).

### Match
Grid of Korean words and translations (6 pairs per round). Tap a word, then its translation: a correct pair disappears, a wrong pair flashes red. Timer and mistake count on top; results list the tricky words.

### Test
- Question type: multiple choice (4 options from the same folder), true/false, or mixed.
- Ask in Korean, translation, or mixed.
- Show correct answers right away, or only at the end.
- Results list every answer, wrong ones first, with a button to retest only the wrong ones. Test answers count toward word progress.
- Keys: `1`–`4` choose, `T`/`F` true/false, `Enter` next, `S` listen.

### Flashcards
- **Know** (→, swipe right): next card. **Don't know** (←, swipe left): card flips to show the answer.
- Tap card / Space: flip. `S`: hear the Korean word.
- A word is *mastered* after 3 correct answers in a row; one miss sends it back to *learning*.
- Missed words can come back later in the same session (toggle on the folder page).
