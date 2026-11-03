'use strict';
// Hangul -> Revised Romanization. Used only when an uploaded line has no reading.
// Covers syllable decomposition, liaison (final consonant moving onto a following ㅇ) and ㄹㄹ -> ll.

const RR_INITIAL = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const RR_VOWEL = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const RR_FINAL = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
// Final consonant pronounced as the next syllable's initial when that syllable starts with ㅇ.
const RR_LINK = ['', 'g', 'kk', 'ks', 'n', 'nj', 'n', 'd', 'r', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'r', 'm', 'b', 'ps', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', ''];

function romanize(text) {
  let out = '';
  let pending = 0; // final consonant index of the previous syllable, not yet written
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const s = code - 0xac00;
      const ini = Math.floor(s / 588);
      const vow = Math.floor((s % 588) / 28);
      const fin = s % 28;
      let initial = RR_INITIAL[ini];
      if (pending) {
        if (ini === 11 && pending !== 21) initial = RR_LINK[pending];
        else if (ini === 5 && pending === 8) {
          out += 'l';
          initial = 'l';
        } else out += RR_FINAL[pending];
      }
      out += initial + RR_VOWEL[vow];
      pending = fin;
    } else {
      out += RR_FINAL[pending] + ch;
      pending = 0;
    }
  }
  return out + RR_FINAL[pending];
}
