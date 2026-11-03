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

## Practice modes

Pick a mode on the folder page; its settings appear below it.

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
