import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with Argon2id and verifies the right password only', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await service.verify(hash, 'correct horse battery staple')).toBe(true);
    expect(await service.verify(hash, 'wrong password')).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await service.hash('same-password-123');
    const b = await service.hash('same-password-123');
    expect(a).not.toBe(b);
  });

  it('returns false instead of throwing on a malformed hash', async () => {
    expect(await service.verify('not-a-hash', 'anything')).toBe(false);
  });
});
