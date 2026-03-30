import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchTagsDto } from './dto/search-tags.dto';

export interface TagResult {
  id: string;
  ticker: string;
  name: string;
  market: string;
  asset_type: string;
  currency: string | null;
  exchange: string | null;
  last_synced_at: string;
}

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(dto: SearchTagsDto): Promise<TagResult[]> {
    const limit = Math.min(dto.limit ?? 10, 50);
    const q = dto.q.trim();

    if (!q) return [];

    const tags = await this.prisma.assetTag.findMany({
      where: {
        AND: [
          ...(dto.market ? [{ market: dto.market }] : []),
          {
            OR: [
              { ticker: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
            ],
          },
        ],
      },
      orderBy: [
        // Exact ticker match first, then prefix match, then general
        { ticker: 'asc' },
      ],
      take: limit,
      select: {
        id: true,
        ticker: true,
        name: true,
        market: true,
        asset_type: true,
        currency: true,
        exchange: true,
        last_synced_at: true,
      },
    });

    // Sort: exact ticker match > starts-with > contains
    const upper = q.toUpperCase();
    tags.sort((a, b) => {
      const aExact = a.ticker === upper ? 0 : a.ticker.startsWith(upper) ? 1 : 2;
      const bExact = b.ticker === upper ? 0 : b.ticker.startsWith(upper) ? 1 : 2;
      if (aExact !== bExact) return aExact - bExact;
      return a.ticker.localeCompare(b.ticker);
    });

    return tags.map((t) => ({ ...t, last_synced_at: t.last_synced_at.toISOString() }));
  }

  async findOne(ticker: string): Promise<TagResult> {
    const tag = await this.prisma.assetTag.findUnique({
      where: { ticker: ticker.toUpperCase() },
    });

    if (!tag) throw new NotFoundException(`Ticker ${ticker.toUpperCase()} not found`);

    return { ...tag, last_synced_at: tag.last_synced_at.toISOString() };
  }
}
