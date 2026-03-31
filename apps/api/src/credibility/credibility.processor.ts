import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { CredibilityService } from './credibility.service';

@Processor('credibility')
export class CredibilityProcessor {
  private readonly logger = new Logger(CredibilityProcessor.name);

  constructor(private readonly credibilityService: CredibilityService) {}

  @Process('credibility-recompute')
  async handleRecompute(job: Job<{ expertUserId: string }>): Promise<void> {
    this.logger.log(`Processing credibility recompute for user ${job.data.expertUserId}`);
    await this.credibilityService.computeForExpert(job.data.expertUserId);
    this.logger.log(`Credibility recompute complete for user ${job.data.expertUserId}`);
  }
}
