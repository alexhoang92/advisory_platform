import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchTagsDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsEnum(['us_stock', 'crypto', 'id_stock', 'vn_stock'])
  market?: 'us_stock' | 'crypto' | 'id_stock' | 'vn_stock';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
