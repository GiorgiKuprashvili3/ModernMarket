// Georgian (Mkhedruli) to Latin transliteration, so Georgian titles still produce readable,
// SEO-friendly URL slugs.
const GEORGIAN_TO_LATIN: Record<string, string> = {
  ა: 'a', ბ: 'b', გ: 'g', დ: 'd', ე: 'e', ვ: 'v', ზ: 'z', თ: 't', ი: 'i', კ: 'k', ლ: 'l', მ: 'm',
  ნ: 'n', ო: 'o', პ: 'p', ჟ: 'zh', რ: 'r', ს: 's', ტ: 't', უ: 'u', ფ: 'p', ქ: 'k', ღ: 'gh', ყ: 'q',
  შ: 'sh', ჩ: 'ch', ც: 'ts', ძ: 'dz', წ: 'ts', ჭ: 'ch', ხ: 'kh', ჯ: 'j', ჰ: 'h',
};

/** Lowercase ASCII slug. Returns `fallback` when nothing usable remains (e.g. only symbols). */
export function slugify(input: string, fallback = 'item'): string {
  const transliterated = Array.from(input.normalize('NFKD'))
    .map((ch) => GEORGIAN_TO_LATIN[ch] ?? ch)
    .join('');
  const slug = transliterated
    .replace(/[̀-ͯ]/g, '') // drop combining accents left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || fallback;
}
