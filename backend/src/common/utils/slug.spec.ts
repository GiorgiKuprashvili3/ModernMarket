import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates ASCII', () => {
    expect(slugify('Hello World  2026!')).toBe('hello-world-2026');
  });

  it('transliterates Georgian', () => {
    expect(slugify('თბილისი')).toBe('tbilisi');
    expect(slugify('მაღაზია')).toBe('maghazia');
  });

  it('strips accents', () => {
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });

  it('falls back when nothing usable remains', () => {
    expect(slugify('!!!', 'store')).toBe('store');
  });

  it('caps the length without leaving a trailing hyphen', () => {
    const slug = slugify('a '.repeat(100));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});
