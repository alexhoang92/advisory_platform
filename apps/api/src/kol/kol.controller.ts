import { Controller, Get, Post, Query } from '@nestjs/common';
import { KolService, KolLeaderboardEntry } from './kol.service';

@Controller('kol')
export class KolController {
  constructor(private readonly kolService: KolService) {}

  @Get('leaderboard')
  async getLeaderboard(@Query('period') period?: string): Promise<KolLeaderboardEntry[]> {
    return this.kolService.getLeaderboard(period ?? 'T30D');
  }

  @Post('pipeline/run')
  runPipeline(): { started: boolean; message: string } {
    return this.kolService.runPipeline();
  }
}
