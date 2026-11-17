import { Module } from '@nestjs/common';
import { EmailWorkerService } from './email-worker.service';
import { MailService } from './mail.service';

@Module({
  providers: [MailService, EmailWorkerService],
  exports: [MailService],
})
export class MailModule {}
