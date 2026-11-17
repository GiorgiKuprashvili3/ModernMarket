import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const VERSION = 'v1';

/**
 * Application-level encryption (AES-256-GCM) for sensitive fields such as seller identification
 * numbers. Output format: `v1:<base64(iv | authTag | ciphertext)>`. The version prefix leaves room
 * for key rotation later.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>('DATA_ENCRYPTION_KEY'), 'base64');
    if (this.key.length !== 32) {
      throw new Error('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION}:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [version, data] = payload.split(':');
    if (version !== VERSION || !data) throw new Error('Unsupported ciphertext format');
    const raw = Buffer.from(data, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
