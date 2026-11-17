import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RenderedEmail } from './email-templates';

/**
 * Transport seam. Only the `console` transport exists so far (development). A real SMTP / provider
 * transport is a documented TODO: it needs a mail library (e.g. nodemailer) and provider credentials,
 * neither of which has been configured or tested. Production refuses to start with `console`.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, email: RenderedEmail): Promise<void> {
    const transport = this.config.get<string>('MAIL_TRANSPORT') ?? 'console';

    if (transport === 'console') {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error('MAIL_TRANSPORT=console is not allowed in production');
      }
      // Development only: the body can contain one-time links, so this never runs in production.
      this.logger.log(`EMAIL to=${to} subject="${email.subject}"\n${email.text}`);
      return;
    }

    throw new Error(`Mail transport "${transport}" is not implemented yet`);
  }
}
