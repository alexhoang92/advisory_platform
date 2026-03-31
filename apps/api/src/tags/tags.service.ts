import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KolService } from '../kol/kol.service';
import { SearchTagsDto } from './dto/search-tags.dto';
import { Market, AssetType } from '@prisma/client';

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

// Known crypto symbols (bare) that the KOL tracker might emit without the -USD suffix.
const KNOWN_CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'USDC', 'ADA', 'AVAX', 'DOGE', 'TRX',
  'DOT', 'MATIC', 'LTC', 'SHIB', 'LINK', 'BCH', 'UNI', 'ATOM', 'XLM', 'ETC',
  'FIL', 'ALGO', 'ICP', 'APT', 'ARB', 'OP', 'SUI', 'INJ', 'SEI', 'NEAR',
  'AAVE', 'MKR', 'GRT', 'SNX', 'CRV', 'COMP', 'FTM', 'MANA', 'SAND', 'AXS',
  'THETA', 'VET', 'EOS', 'XTZ', 'EGLD', 'HBAR', 'QNT', 'LDO', 'RPL', 'PEPE',
]);

@Injectable()
export class TagsService implements OnModuleInit {
  private readonly logger = new Logger(TagsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kolService: KolService,
  ) {}

  /** On startup, kick off an initial sync so the DB is up-to-date. */
  async onModuleInit() {
    // Run async so startup isn't delayed
    this.syncKolTickers().catch((err) =>
      this.logger.warn(`Initial ticker sync failed: ${err?.message}`),
    );
  }

  // ─── Daily cron at 02:00 UTC ───────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailyTickerSync() {
    this.logger.log('Running daily ticker sync from KOL recommendations...');
    const result = await this.syncKolTickers();
    this.logger.log(`Daily sync complete — ${result.synced} tickers upserted`);
  }

  // ─── Public methods ────────────────────────────────────────────────────────

  async search(dto: SearchTagsDto): Promise<TagResult[]> {
    const limit = Math.min(dto.limit ?? 10, 50);
    const q = dto.q.trim();

    if (!q) return [];

    const tags = await this.prisma.assetTag.findMany({
      where: {
        AND: [
          ...(dto.market ? [{ market: dto.market as Market }] : []),
          {
            OR: [
              { ticker: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
            ],
          },
        ],
      },
      orderBy: [{ ticker: 'asc' }],
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
    const upper = ticker.toUpperCase();

    // Try exact match first, then crypto with -USD suffix
    let tag = await this.prisma.assetTag.findUnique({ where: { ticker: upper } });
    if (!tag && KNOWN_CRYPTO_SYMBOLS.has(upper)) {
      tag = await this.prisma.assetTag.findUnique({ where: { ticker: `${upper}-USD` } });
    }

    if (!tag) throw new NotFoundException(`Ticker ${upper} not found`);

    return { ...tag, last_synced_at: tag.last_synced_at.toISOString() };
  }

  /**
   * Pulls distinct tickers from KOL tracker recommendations and upserts any
   * missing ones into asset_tags as stubs.  Normalises bare crypto symbols
   * (e.g. "BTC" → "BTC-USD") and skips obviously invalid symbols.
   */
  async syncKolTickers(): Promise<{ synced: number; skipped: number }> {
    const rawTickers = await this.kolService.getDistinctRecommendationTickers();
    const now = new Date();
    let synced = 0;
    let skipped = 0;

    for (const raw of rawTickers) {
      const ticker = this.normaliseKolTicker(raw);
      if (!ticker) { skipped++; continue; }

      // Check if already in asset_tags
      const existing = await this.prisma.assetTag.findUnique({ where: { ticker } });
      if (existing) {
        // Update last_synced_at to mark it as still active
        await this.prisma.assetTag.update({
          where: { ticker },
          data: { last_synced_at: now },
        });
        synced++;
        continue;
      }

      // Determine market & type from ticker format
      const { market, asset_type, currency, exchange } = this.inferTickerMeta(ticker);

      await this.prisma.assetTag.create({
        data: {
          ticker,
          name: ticker,      // stub — name matches ticker until enriched
          market,
          asset_type,
          currency,
          exchange,
          last_synced_at: now,
        },
      });
      synced++;
    }

    return { synced, skipped };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Normalises a raw ticker string from the KOL tracker:
   *  - Uppercases
   *  - Converts bare crypto symbols to "<SYMBOL>-USD" format
   *  - Returns null for obviously invalid symbols (empty, too long, etc.)
   */
  private normaliseKolTicker(raw: string): string | null {
    const t = raw.trim().toUpperCase();
    if (!t || t.length > 15) return null;
    // Reject strings with spaces or special chars other than -, .
    if (/[^A-Z0-9\-\.]/.test(t)) return null;

    // If it's a known bare crypto symbol, convert to -USD format
    if (KNOWN_CRYPTO_SYMBOLS.has(t)) return `${t}-USD`;

    return t;
  }

  private inferTickerMeta(ticker: string): {
    market: Market;
    asset_type: AssetType;
    currency: string;
    exchange: string;
  } {
    if (ticker.endsWith('-USD') || ticker.endsWith('USD')) {
      return { market: Market.crypto, asset_type: AssetType.crypto, currency: 'USD', exchange: 'Crypto' };
    }
    if (ticker.endsWith('.JK')) {
      return { market: Market.id_stock, asset_type: AssetType.stock, currency: 'IDR', exchange: 'IDX' };
    }
    if (ticker.endsWith('.VN')) {
      return { market: Market.vn_stock, asset_type: AssetType.stock, currency: 'VND', exchange: 'HOSE' };
    }
    return { market: Market.us_stock, asset_type: AssetType.stock, currency: 'USD', exchange: 'NYSE/NASDAQ' };
  }
}
