import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { EmailLocale, renderEmail } from './email-templates';
import { MailService } from './mail.service';

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;
// While a worker is sending a row it "leases" it by pushing nextAttemptAt forward, so a second
// instance (or the next poll) does not pick the same row up again.
const LEASE_MS = 2 * 60_000;

/**
 * Sends queued emails from `email_outbox`. Failures are retried with exponential backoff and never
 * affect the operation that queued the email (orders, registration, ...). After a successful send or
 * the final failure the payload is cleared, because it may hold one-time links.
 */
@Injectable()
export class EmailWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EmailWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('WORKERS_ENABLED') === 'false' || this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Exposed for tests and manual triggering. */
  async tick(): Promise<number> {
    if (this.running) return 0; // never overlap with a previous tick
    this.running = true;
    try {
      const claimed = await this.claimBatch();
      for (const id of claimed) await this.process(id);
      return claimed.length;
    } catch (error) {
      this.logger.error(`Email worker tick failed: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async claimBatch(): Promise<bigint[]> {
    return this.prisma.$transaction(async (tx) => {
      // The current time is passed as a parameter (UTC) instead of using NOW(), so the comparison does
      // not depend on the database session time zone.
      const now = new Date();
      const rows = await tx.$queryRaw<Array<{ id: bigint }>>`
        SELECT id FROM email_outbox
        WHERE status = 'PENDING' AND next_attempt_at <= ${now}
        ORDER BY id
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED`;
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      await tx.emailOutbox.updateMany({
        where: { id: { in: ids } },
        data: { nextAttemptAt: new Date(Date.now() + LEASE_MS) },
      });
      return ids;
    });
  }

  private async process(id: bigint): Promise<void> {
    const row = await this.prisma.emailOutbox.findUnique({ where: { id } });
    if (!row || row.status !== 'PENDING') return;

    try {
      const rendered = renderEmail(row.template, row.locale as EmailLocale, row.payload as Record<string, unknown>);
      await this.mail.send(row.toEmail, rendered);
      await this.prisma.emailOutbox.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), attempts: row.attempts + 1, payload: {}, lastError: null },
      });
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      const final = attempts >= MAX_ATTEMPTS;
      this.logger.warn(`Email ${id} failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`);
      await this.prisma.emailOutbox.update({
        where: { id },
        data: final
          ? { status: 'FAILED', attempts, lastError: message, payload: {} }
          : { attempts, lastError: message, nextAttemptAt: new Date(Date.now() + this.backoffMs(attempts)) },
      });
    }
  }

  /** 1, 2, 4, 8 minutes... capped at one hour. */
  private backoffMs(attempts: number): number {
    return Math.min(60_000 * 2 ** (attempts - 1), 3_600_000);
  }
}
