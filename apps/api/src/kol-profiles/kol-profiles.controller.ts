import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KolProfilesService } from './kol-profiles.service';
import { KolService } from '../kol/kol.service';

@Controller('kol-profiles')
export class KolProfilesController {
  constructor(
    private readonly service: KolProfilesService,
    private readonly kolService: KolService,
  ) {}

  /** List KOL profiles. Optionally filter by status (unclaimed | claimed). */
  @Get()
  findAll(@Query('status') status?: string) {
    return this.service.findAll(status);
  }

  /** Sync KOL profiles from the kol-tracker database (idempotent). */
  @Post('sync')
  sync() {
    return this.service.syncFromKolDb();
  }

  /** Get a single KOL profile by Twitter handle. */
  @Get(':handle')
  findOne(@Param('handle') handle: string) {
    return this.service.findByHandle(handle);
  }

  /**
   * Claim a KOL profile.  The authenticated user links their Hamilton account
   * to the scraped profile so they can take ownership of the page.
   */
  @Post(':handle/claim')
  @UseGuards(JwtAuthGuard)
  claim(@Param('handle') handle: string, @Request() req: any) {
    return this.service.claimProfile(handle, req.user.id);
  }

  /** Get recent recommendations for a specific KOL by Twitter handle. */
  @Get(':handle/recommendations')
  getRecommendations(
    @Param('handle') handle: string,
    @Query('limit') limit?: string,
  ) {
    return this.kolService.getRecommendationsByHandle(handle, limit ? parseInt(limit, 10) : 20);
  }
}
