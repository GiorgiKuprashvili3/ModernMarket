import { TokenService } from './token.service';

describe('TokenService', () => {
  const service = new TokenService();

  it('generates unique, URL-safe tokens with enough length', () => {
    const a = service.generate();
    const b = service.generate();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it('hashes deterministically to 64 hex characters and never returns the raw token', () => {
    const token = service.generate();
    const hash = service.hash(token);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(hash).toBe(service.hash(token));
    expect(hash).not.toContain(token);
  });

  it('creates distinct family ids', () => {
    expect(service.newFamilyId()).not.toBe(service.newFamilyId());
  });
});
