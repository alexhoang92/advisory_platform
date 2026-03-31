import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KolService } from '../kol/kol.service';

export interface KolProfileResult {
  id: string;
  kol_id: number;
  twitter_handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  content_type: string | null;
  profile_url: string | null;
  status: string;
  claimed_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
}

@Injectable()
export class KolProfilesService {
  private readonly logger = new Logger(KolProfilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kolService: KolService,
  ) {}

  // ─── Daily cron at 02:15 UTC (after ticker sync) ──────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailyProfileSync() {
    this.logger.log('Running daily KOL profile sync...');
    const result = await this.syncFromKolDb();
    this.logger.log(
      `Daily profile sync complete — ${result.created} created, ${result.updated} updated`,
    );
  }

  // ─── Public methods ────────────────────────────────────────────────────────

  /**
   * Import all active KOLs from the kol-tracker database into
   * unclaimed_kol_profiles (upsert — safe to run repeatedly).
   */
  async syncFromKolDb(): Promise<{ created: number; updated: number }> {
    const kols = await this.kolService.getAllKols();
    let created = 0;
    let updated = 0;

    for (const kol of kols) {
      const existing = await this.prisma.unclaimedKolProfile.findUnique({
        where: { kol_id: kol.id },
      });

      const data = {
        twitter_handle: kol.handle,
        display_name: kol.display_name ?? kol.handle,
        followers_count: kol.followers_approx ?? 0,
        content_type: kol.content_type ?? null,
        profile_url: kol.profile_url ?? `https://x.com/${kol.handle}`,
      };

      if (existing) {
        // Only update mutable fields; don't touch status or claimed fields
        if (existing.status === 'unclaimed') {
          await this.prisma.unclaimedKolProfile.update({
            where: { kol_id: kol.id },
            data,
          });
          updated++;
        }
      } else {
        await this.prisma.unclaimedKolProfile.create({
          data: { ...data, kol_id: kol.id },
        });
        created++;
      }
    }

    return { created, updated };
  }

  async findAll(status?: string): Promise<KolProfileResult[]> {
    const profiles = await this.prisma.unclaimedKolProfile.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: [{ followers_count: 'desc' }, { created_at: 'desc' }],
    });
    return profiles.map(this.toResult);
  }

  async findByHandle(handle: string): Promise<KolProfileResult> {
    const profile = await this.prisma.unclaimedKolProfile.findUnique({
      where: { twitter_handle: handle.toLowerCase() },
    });
    if (!profile) throw new NotFoundException(`KOL profile @${handle} not found`);
    return this.toResult(profile);
  }

  /**
   * Claim an unclaimed profile.  The authenticated user associates their
   * Hamilton account with the scraped KOL profile (TripAdvisor model).
   */
  async claimProfile(handle: string, userId: string): Promise<KolProfileResult> {
    const profile = await this.prisma.unclaimedKolProfile.findUnique({
      where: { twitter_handle: handle.toLowerCase() },
    });

    if (!profile) throw new NotFoundException(`KOL profile @${handle} not found`);
    if (profile.status === 'claimed') {
      throw new ConflictException(`@${handle} has already been claimed`);
    }

    // Ensure this user hasn't already claimed a different profile
    const alreadyClaimed = await this.prisma.unclaimedKolProfile.findFirst({
      where: { claimed_user_id: userId },
    });
    if (alreadyClaimed) {
      throw new ConflictException(
        `You have already claimed @${alreadyClaimed.twitter_handle}`,
      );
    }

    const updated = await this.prisma.unclaimedKolProfile.update({
      where: { twitter_handle: handle.toLowerCase() },
      data: {
        status: 'claimed',
        claimed_user_id: userId,
        claimed_at: new Date(),
      },
    });

    return this.toResult(updated);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private toResult(p: {
    id: string;
    kol_id: number;
    twitter_handle: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    followers_count: number;
    content_type: string | null;
    profile_url: string | null;
    status: string;
    claimed_user_id: string | null;
    claimed_at: Date | null;
    created_at: Date;
  }): KolProfileResult {
    return {
      ...p,
      claimed_at: p.claimed_at?.toISOString() ?? null,
      created_at: p.created_at.toISOString(),
    };
  }
}
