import {
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KolProfilesService } from './kol-profiles.service';
import { KolService } from '../kol/kol.service';

// Optional JWT guard: passes through even without a token (returns null user)
class OptionalJwtGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override handleRequest(_err: unknown, user: any): any {
    return user ?? null;
  }
}

@Controller('kol-profiles')
export class KolProfilesController {
  constructor(
    private readonly service: KolProfilesService,
    private readonly kolService: KolService,
  ) {}

  /** List KOL profiles. Optionally filter by status (unclaimed | claimed). */
  @Get()
  @UseGuards(OptionalJwtGuard)
  findAll(@Query('status') status: string | undefined, @Request() req: any) {
    return this.service.findAll(status, req.user?.id);
  }

  /** Sync KOL profiles from the kol-tracker database (idempotent). */
  @Post('sync')
  sync() {
    return this.service.syncFromKolDb();
  }

  /**
   * Get recent recommendations from followed KOL profiles.
   * NOTE: Must be declared before `:handle` to avoid route conflict.
   */
  @Get('followed-recommendations')
  @UseGuards(JwtAuthGuard)
  getFollowedRecommendations(
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    return this.service.getFollowedRecommendations(
      req.user.id,
      limit ? parseInt(limit, 10) : 5,
    );
  }

  /** Get a single KOL profile by Twitter handle. */
  @Get(':handle')
  @UseGuards(OptionalJwtGuard)
  findOne(@Param('handle') handle: string, @Request() req: any) {
    return this.service.findByHandle(handle, req.user?.id);
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

  /** Follow a KOL profile. */
  @Post(':handle/follow')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  follow(@Param('handle') handle: string, @Request() req: any) {
    return this.service.follow(handle, req.user.id);
  }

  /** Unfollow a KOL profile. */
  @Delete(':handle/follow')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  unfollow(@Param('handle') handle: string, @Request() req: any) {
    return this.service.unfollow(handle, req.user.id);
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
