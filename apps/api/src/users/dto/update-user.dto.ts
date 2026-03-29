import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  display_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string | null;

  @IsOptional()
  @IsUrl()
  website?: string | null;

  @IsOptional()
  @IsUrl()
  avatar_url?: string | null;
}
