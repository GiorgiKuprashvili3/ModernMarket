import { randomBytes } from 'crypto';
import { CryptoService } from './crypto.service';

const configWith = (key: string) => ({ getOrThrow: () => key }) as never;
const validKey = randomBytes(32).toString('base64');

describe('CryptoService', () => {
  it('round-trips text, including Georgian', () => {
    const service = new CryptoService(configWith(validKey));
    for (const text of ['01234567890', 'გიორგი 123']) {
      expect(service.decrypt(service.encrypt(text))).toBe(text);
    }
  });

  it('uses a fresh IV so equal inputs encrypt differently', () => {
    const service = new CryptoService(configWith(validKey));
    expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
  });

  it('does not contain the plaintext', () => {
    const service = new CryptoService(configWith(validKey));
    expect(service.encrypt('01234567890')).not.toContain('01234567890');
  });

  it('detects tampering', () => {
    const service = new CryptoService(configWith(validKey));
    const encrypted = service.encrypt('secret');
    const [prefix, data] = encrypted.split(':');
    const raw = Buffer.from(data, 'base64');
    raw[raw.length - 1] ^= 0xff;
    expect(() => service.decrypt(`${prefix}:${raw.toString('base64')}`)).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    expect(() => new CryptoService(configWith(randomBytes(16).toString('base64')))).toThrow(/32 bytes/);
  });
});
