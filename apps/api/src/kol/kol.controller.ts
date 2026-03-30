import { Controller, Get, Post, Query } from '@nestjs/common';
import { KolService, KolLeaderboardEntry, TopOpportunity, RecentCall } from './kol.service';

@Controller('kol')
export class KolController {
  constructor(private readonly kolService: KolService) {}

  @Get('leaderboard')
  async getLeaderboard(@Query('period') period?: string): Promise<KolLeaderboardEntry[]> {
    return this.kolService.getLeaderboard(period ?? 'T30D');
  }

  @Get('top-opportunities')
  async getTopOpportunities(): Promise<TopOpportunity[]> {
    return this.kolService.getTopOpportunities();
  }

  @Get('recent-calls')
  async getRecentCalls(@Query('limit') limit?: string): Promise<RecentCall[]> {
    return this.kolService.getRecentCalls(limit ? parseInt(limit, 10) : 20);
  }

  @Post('pipeline/run')
  runPipeline(): { started: boolean; message: string } {
    return this.kolService.runPipeline();
  }
}
