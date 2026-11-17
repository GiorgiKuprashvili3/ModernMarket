import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';

/** Opaque random tokens. Only the SHA-256 hash is ever stored; the raw value goes to the client/email. */
@Injectable()
export class TokenService {
  /** 256 bits of entropy, URL-safe. */
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  /** High-entropy random input, so a fast hash is appropriate (unlike passwords). */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  newFamilyId(): string {
    return randomUUID();
  }
}
