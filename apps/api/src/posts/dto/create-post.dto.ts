import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
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
  @IsIn(['discussion', 'trade_call', 'research', 'update'])
  post_type?: 'discussion' | 'trade_call' | 'research' | 'update';

  @IsOptional()
  @IsString()
  published_at?: string | null;
}
