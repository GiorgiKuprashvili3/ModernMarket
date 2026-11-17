import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

// OWASP-recommended Argon2id baseline (19 MiB, 2 iterations, 1 lane). Tune against real hardware
// before production: the goal is roughly 50-250 ms per hash on the server.
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Burns roughly the same time as a real verification. Used when the account does not exist so that
   * response time does not reveal which emails are registered.
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('not-a-real-password');
    await this.verify(await this.dummyHash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON_OPTIONS);
  }
}
