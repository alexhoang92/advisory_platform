import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @IsString()
  @MinLength(1)
  body_public!: string;

  @IsOptional()
  @IsString()
  body_locked?: string | null;

  @IsOptional()
  @IsIn(['public', 'preview', 'subscribers_only'])
  visibility?: 'public' | 'preview' | 'subscribers_only';

  @IsOptional()
  @IsInt()
  @Min(0)
  unlock_price?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tickers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  image_urls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ticker_tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  user_mentions?: string[];

  @IsOptional()
  @IsIn(['discussion', 'trade_call', 'research', 'update'])
  post_type?: 'discussion' | 'trade_call' | 'research' | 'update';

  @IsOptional()
  @IsString()
  published_at?: string | null;

  // Trade-call specific fields
  @IsOptional()
  @IsString()
  trade_ticker?: string;

  @IsOptional()
  @IsIn(['long', 'short'])
  trade_direction?: 'long' | 'short';

  @IsOptional()
  @IsNumber()
  @IsPositive()
  trade_target_price?: number | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  trade_stop_loss?: number | null;

  @IsOptional()
  @IsIn(['intraday', 'swing', 'position', 'long_term'])
  trade_timeframe?: 'intraday' | 'swing' | 'position' | 'long_term';

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  trade_conviction?: 'low' | 'medium' | 'high';
}
